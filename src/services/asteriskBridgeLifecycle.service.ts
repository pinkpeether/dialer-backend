import net from 'net'

const AMI_ENABLED = String(process.env.ASTERISK_AMI_ENABLED || '').toLowerCase() === 'true'
const AMI_HOST = process.env.ASTERISK_AMI_HOST || '127.0.0.1'
const AMI_PORT = Number(process.env.ASTERISK_AMI_PORT || 5038)
const AMI_USERNAME = process.env.ASTERISK_AMI_USERNAME || ''
const AMI_PASSWORD = process.env.ASTERISK_AMI_PASSWORD || ''
const AMI_TIMEOUT_MS = Number(process.env.ASTERISK_AMI_TIMEOUT_MS || 8000)
const ORIGINATE_ACCOUNT = process.env.ASTERISK_ORIGINATE_ACCOUNT || 'ptdt-dialer'

export type AsteriskBridgeLifecycleInput = {
  callId?: number | string | null
  providerCallId?: string | null
  phone?: string | null
  agentExtension?: string | null
}

export type AsteriskBridgeLifecycleSnapshot = {
  enabled: boolean
  channels: string[]
  bridgeIds: string[]
  bridgeDurationSeconds: number | null
  channelDurationSeconds: number | null
  rawChannels: string
  rawBridges: string
}

type ConciseChannel = {
  channel: string
  context: string
  exten: string
  state: string
  application: string
  data: string
  callerIdNum: string
  accountCode: string
  durationSeconds: number | null
  bridgeId: string
  uniqueId: string
  raw: string
}

const sanitizeExtension = (value?: string | null) => value ? value.replace(/[^0-9A-Za-z_.-]/g, '').trim() : ''
const digitsOnly = (value?: string | null) => value ? value.replace(/\D/g, '') : ''

function amiCommand(lines: Array<string | null | undefined>) {
  return lines.filter(Boolean).join('\r\n') + '\r\n\r\n'
}

function loginAction() {
  return amiCommand([
    'Action: Login',
    'Username: ' + AMI_USERNAME,
    'Secret: ' + AMI_PASSWORD,
    'Events: off',
  ])
}

function commandAction(command: string) {
  return amiCommand([
    'Action: Command',
    'Command: ' + command,
  ])
}

function logoffAction() {
  return amiCommand(['Action: Logoff'])
}

function parseSeconds(value?: string | null) {
  const n = Number(value || '')
  return Number.isFinite(n) ? n : null
}

function parseClockDuration(value: string) {
  const parts = value.trim().split(':').map(Number)
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

function sendAmiCommand(command: string, timeoutMs = Math.max(AMI_TIMEOUT_MS, 2500)): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: AMI_HOST, port: AMI_PORT })
    let buffer = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.end(logoffAction())
      resolve(buffer)
    }, timeoutMs)

    socket.setEncoding('utf8')

    socket.on('data', chunk => {
      buffer += chunk

      if (!settled && buffer.includes('Response: Error')) {
        settled = true
        clearTimeout(timer)
        socket.end(logoffAction())
        reject(new Error(buffer.split('\r\n').find(line => line.startsWith('Message:')) || 'AMI command failed'))
        return
      }

      if (!settled && buffer.includes('--END COMMAND--')) {
        settled = true
        clearTimeout(timer)
        socket.end(logoffAction())
        resolve(buffer)
      }
    })

    socket.on('error', err => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    socket.on('connect', () => {
      socket.write(loginAction())
      socket.write(commandAction(command))
    })

    socket.on('close', () => {
      clearTimeout(timer)
      if (!settled) resolve(buffer)
    })
  })
}

function parseConciseChannels(raw: string): ConciseChannel[] {
  return raw
    .split(/\r?\n/)
    .map(line => line.replace(/^Output:\s*/, '').trim())
    .filter(line => line.includes('!'))
    .map(line => {
      const parts = line.split('!')
      return {
        channel: parts[0] || '',
        context: parts[1] || '',
        exten: parts[2] || '',
        state: parts[4] || '',
        application: parts[5] || '',
        data: parts[6] || '',
        callerIdNum: parts[7] || '',
        accountCode: parts[8] || '',
        durationSeconds: parseSeconds(parts[10]),
        bridgeId: parts[11] || '',
        uniqueId: parts[12] || '',
        raw: line,
      }
    })
}

function parseBridgeDurations(raw: string) {
  const durations = new Map<string, number>()

  raw.split(/\r?\n/).forEach(line => {
    const clean = line.replace(/^Output:\s*/, '').trim()
    const match = clean.match(/^([0-9a-f-]{12,})\s+.*\s+(\d+:\d{2}:\d{2})$/i)
    if (!match) return

    const durationSeconds = parseClockDuration(match[2])
    if (durationSeconds === null) return
    durations.set(match[1], durationSeconds)
  })

  return durations
}

function findMatchingChannels(channels: ConciseChannel[], input: AsteriskBridgeLifecycleInput) {
  const phoneDigits = digitsOnly(input.phone)
  const agentExtension = sanitizeExtension(input.agentExtension)
  const callId = input.callId ? String(input.callId) : ''
  const providerCallId = input.providerCallId ? String(input.providerCallId) : ''

  return channels.filter(item => {
    const blob = [
      item.channel,
      item.context,
      item.exten,
      item.state,
      item.application,
      item.data,
      item.callerIdNum,
      item.accountCode,
      item.bridgeId,
      item.uniqueId,
      item.raw,
    ].join(' ')

    const blobDigits = digitsOnly(blob)

    const matchesPhone = Boolean(phoneDigits && blobDigits.includes(phoneDigits))
    const matchesAgent = Boolean(agentExtension && (
      item.channel.includes('/' + agentExtension + '-') ||
      item.exten === agentExtension ||
      item.data.includes('/' + agentExtension)
    ))
    const matchesCallId = Boolean(callId && blob.includes(callId))
    const matchesProvider = Boolean(providerCallId && blob.includes(providerCallId))

    const hasStrongMatch = matchesPhone || matchesAgent || matchesCallId || matchesProvider
    const weakAccountMatch = !phoneDigits && !agentExtension && !callId && !providerCallId && Boolean(ORIGINATE_ACCOUNT && blob.includes(ORIGINATE_ACCOUNT))

    return hasStrongMatch || weakAccountMatch
  })
}

export async function getAsteriskBridgeLifecycleSnapshot(input: AsteriskBridgeLifecycleInput): Promise<AsteriskBridgeLifecycleSnapshot> {
  if (!AMI_ENABLED || !AMI_USERNAME || !AMI_PASSWORD) {
    return {
      enabled: false,
      channels: [],
      bridgeIds: [],
      bridgeDurationSeconds: null,
      channelDurationSeconds: null,
      rawChannels: '',
      rawBridges: '',
    }
  }

  const [rawChannels, rawBridges] = await Promise.all([
    sendAmiCommand('core show channels concise'),
    sendAmiCommand('bridge show all'),
  ])

  const channels = parseConciseChannels(rawChannels)
  const bridgeDurations = parseBridgeDurations(rawBridges)
  const matchedChannels = findMatchingChannels(channels, input)

  const bridgeIds = Array.from(new Set(
    matchedChannels
      .map(item => item.bridgeId)
      .filter(value => value && bridgeDurations.has(value)),
  ))

  const bridgeDurationSeconds = bridgeIds.length > 0
    ? Math.max(...bridgeIds.map(id => bridgeDurations.get(id) || 0))
    : null

  const channelDurations = matchedChannels
    .map(item => item.durationSeconds)
    .filter((value): value is number => typeof value === 'number')

  const channelDurationSeconds = channelDurations.length > 0 ? Math.max(...channelDurations) : null

  return {
    enabled: true,
    channels: Array.from(new Set(matchedChannels.map(item => item.channel).filter(Boolean))),
    bridgeIds,
    bridgeDurationSeconds,
    channelDurationSeconds,
    rawChannels,
    rawBridges,
  }
}
