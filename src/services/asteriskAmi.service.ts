import net from 'net'
import logger from '../utils/logger'
import { AppError } from '../middleware/errorHandler'

const AMI_ENABLED = String(process.env.ASTERISK_AMI_ENABLED || '').toLowerCase() === 'true'
const AMI_HOST = process.env.ASTERISK_AMI_HOST || '127.0.0.1'
const AMI_PORT = Number(process.env.ASTERISK_AMI_PORT || 5038)
const AMI_USERNAME = process.env.ASTERISK_AMI_USERNAME || ''
const AMI_PASSWORD = process.env.ASTERISK_AMI_PASSWORD || ''
const AMI_TIMEOUT_MS = Number(process.env.ASTERISK_AMI_TIMEOUT_MS || 8000)
const ORIGINATE_TIMEOUT_MS = Number(process.env.ASTERISK_ORIGINATE_TIMEOUT_MS || 30000)

const CHANNEL_TEMPLATE = process.env.ASTERISK_ORIGINATE_CHANNEL_TEMPLATE || ''
const AGENT_CHANNEL_TEMPLATE = process.env.ASTERISK_AGENT_CHANNEL_TEMPLATE || 'PJSIP/{agentExtension}'
const TRUNK_NAME = process.env.ASTERISK_TRUNK_NAME || ''
const ORIGINATE_CONTEXT = process.env.ASTERISK_ORIGINATE_CONTEXT || ''
const ORIGINATE_EXTENSION_TEMPLATE = process.env.ASTERISK_ORIGINATE_EXTENSION_TEMPLATE || ''
const ORIGINATE_PRIORITY = process.env.ASTERISK_ORIGINATE_PRIORITY || '1'
const ORIGINATE_ACCOUNT = process.env.ASTERISK_ORIGINATE_ACCOUNT || 'ptdt-dialer'
const TWO_LEG_CONTEXT = process.env.ASTERISK_TWO_LEG_CONTEXT || 'ptdt-dynamic-callerid'

export type AmiOriginateInput = {
  to: string
  callerId?: string | null
  callId?: number | string | null
  campaignId?: number | string | null
  agentId?: number | string | null
  agentExtension?: string | null
  dynamicCallerIdUsed?: boolean
}

export type AmiOriginateResult = {
  enabled: boolean
  providerCallId: string
  response?: string
}

export type AmiHangupInput = {
  callId?: number | string | null
  providerCallId?: string | null
  phone?: string | null
  agentExtension?: string | null
}

export type AmiHangupResult = {
  enabled: boolean
  channels: string[]
  response?: string
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
  bridgedTo: string
  raw: string
}

const sanitizeDialString = (value: string) => value.replace(/[^0-9+*#]/g, '')
const sanitizeExtension = (value?: string | null) => value ? value.replace(/[^0-9A-Za-z_.-]/g, '').trim() : ''
const sanitizeCallerId = (value?: string | null) => value ? value.replace(/[\r\n]/g, '').trim() : ''
const digitsOnly = (value?: string | null) => value ? value.replace(/\D/g, '') : ''
const actionId = () => 'ami_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
const replaceToken = (value: string, token: string, replacement: string) => value.split(token).join(replacement)

const renderTemplate = (template: string, input: AmiOriginateInput) => {
  let output = template
  output = replaceToken(output, '{to}', sanitizeDialString(input.to))
  output = replaceToken(output, '{callerId}', sanitizeCallerId(input.callerId))
  output = replaceToken(output, '{trunk}', TRUNK_NAME)
  output = replaceToken(output, '{callId}', String(input.callId || ''))
  output = replaceToken(output, '{campaignId}', String(input.campaignId || ''))
  output = replaceToken(output, '{agentId}', String(input.agentId || ''))
  output = replaceToken(output, '{agentExtension}', sanitizeExtension(input.agentExtension))
  return output
}

function resolveOriginate(input: AmiOriginateInput) {
  const to = sanitizeDialString(input.to)
  if (!to) throw new AppError('Destination phone number is invalid for AMI originate', 400)

  const agentExtension = sanitizeExtension(input.agentExtension)
  if (agentExtension) {
    return {
      channel: renderTemplate(AGENT_CHANNEL_TEMPLATE, input),
      context: TWO_LEG_CONTEXT,
      exten: to,
    }
  }

  const channel = CHANNEL_TEMPLATE
    ? renderTemplate(CHANNEL_TEMPLATE, input)
    : TRUNK_NAME
      ? 'PJSIP/' + to + '@' + TRUNK_NAME
      : ''

  if (!channel) {
    throw new AppError('ASTERISK_ORIGINATE_CHANNEL_TEMPLATE or ASTERISK_TRUNK_NAME is required when AMI originate is enabled', 500)
  }

  return {
    channel,
    context: ORIGINATE_CONTEXT || undefined,
    exten: ORIGINATE_EXTENSION_TEMPLATE ? renderTemplate(ORIGINATE_EXTENSION_TEMPLATE, input) : undefined,
  }
}

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

function logoffAction() {
  return amiCommand(['Action: Logoff'])
}

function sendAmi(actions: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: AMI_HOST, port: AMI_PORT })
    let buffer = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(new AppError('Asterisk AMI request timed out', 504))
    }, AMI_TIMEOUT_MS)

    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      buffer += chunk
      if (!settled && (buffer.includes('Message: Originate successfully queued') || buffer.includes('Response: Error'))) {
        settled = true
        clearTimeout(timer)
        socket.end(logoffAction())
        if (buffer.includes('Response: Error')) {
          reject(new AppError(buffer.split('\r\n').find(line => line.startsWith('Message:')) || 'Asterisk AMI originate failed', 502))
        } else {
          resolve(buffer)
        }
      }
    })
    socket.on('error', err => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    socket.on('connect', () => actions.forEach(action => socket.write(action)))
    socket.on('close', () => {
      clearTimeout(timer)
      if (!settled) resolve(buffer)
    })
  })
}

function sendAmiUntil(actions: string[], done: (buffer: string) => boolean, timeoutMs = AMI_TIMEOUT_MS): Promise<string> {
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
        reject(new AppError(buffer.split('\r\n').find(line => line.startsWith('Message:')) || 'Asterisk AMI request failed', 502))
        return
      }

      if (!settled && done(buffer)) {
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
    socket.on('connect', () => actions.forEach(action => socket.write(action)))
    socket.on('close', () => {
      clearTimeout(timer)
      if (!settled) resolve(buffer)
    })
  })
}

function sendAmiFire(actions: string[], timeoutMs = 1200): Promise<string> {
  return sendAmiUntil(actions, buffer => buffer.includes('Response: Goodbye'), timeoutMs)
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
        bridgedTo: parts[12] || '',
        raw: line,
      }
    })
}

async function listConciseChannels() {
  const commandAction = amiCommand([
    'Action: Command',
    'Command: core show channels concise',
  ])

  const response = await sendAmiUntil(
    [loginAction(), commandAction],
    buffer => buffer.includes('--END COMMAND--') || buffer.includes('Response: Follows'),
    Math.max(AMI_TIMEOUT_MS, 1500),
  )

  return parseConciseChannels(response)
}

function findHangupTargets(channels: ConciseChannel[], input: AmiHangupInput) {
  const phoneDigits = digitsOnly(input.phone)
  const agentExtension = sanitizeExtension(input.agentExtension)
  const callId = input.callId ? String(input.callId) : ''
  const providerCallId = input.providerCallId ? String(input.providerCallId) : ''

  const matched = channels.filter(item => {
    const blob = [
      item.channel,
      item.context,
      item.exten,
      item.application,
      item.data,
      item.callerIdNum,
      item.accountCode,
      item.bridgedTo,
      item.raw,
    ].join(' ')

    const blobDigits = digitsOnly(blob)
    const matchesPhone = Boolean(phoneDigits && blobDigits.includes(phoneDigits))
    const matchesAccount = Boolean(ORIGINATE_ACCOUNT && blob.includes(ORIGINATE_ACCOUNT))
    const matchesCallId = Boolean(callId && blob.includes(callId))
    const matchesProvider = Boolean(providerCallId && blob.includes(providerCallId))
    const matchesAgent = Boolean(agentExtension && (item.channel.includes('/' + agentExtension + '-') || item.exten === agentExtension))

    /*
      Safety rule:
      - Prefer exact customer phone leg.
      - Also allow PTDT account/call markers if Asterisk exposes them.
      - Agent extension fallback is last resort for first-leg cleanup.
    */
    return matchesPhone || matchesAccount || matchesCallId || matchesProvider || matchesAgent
  })

  return Array.from(new Set(matched.map(item => item.channel).filter(Boolean)))
}

export async function originateOutboundCall(input: AmiOriginateInput): Promise<AmiOriginateResult> {
  const providerCallId = actionId()
  if (!AMI_ENABLED) {
    return { enabled: false, providerCallId }
  }
  if (!AMI_USERNAME || !AMI_PASSWORD) throw new AppError('Asterisk AMI credentials are not configured', 500)

  const originate = resolveOriginate(input)
  const callerId = sanitizeCallerId(input.callerId)
  const variableParts = [
    'PTDT_CALL_ID=' + String(input.callId || ''),
    'PTDT_CAMPAIGN_ID=' + String(input.campaignId || ''),
    'PTDT_AGENT_ID=' + String(input.agentId || ''),
    'PTDT_AGENT_EXTENSION=' + sanitizeExtension(input.agentExtension),
    'PTDT_DYNAMIC_CALLER_ID=' + (input.dynamicCallerIdUsed ? '1' : '0'),
    callerId ? 'PTDT_SELECTED_CALLER_ID=' + callerId : '',
  ].filter(Boolean)

  const originateAction = amiCommand([
    'Action: Originate',
    'ActionID: ' + providerCallId,
    'Channel: ' + originate.channel,
    originate.context ? 'Context: ' + originate.context : undefined,
    originate.exten ? 'Exten: ' + originate.exten : undefined,
    originate.context ? 'Priority: ' + ORIGINATE_PRIORITY : undefined,
    callerId ? 'CallerID: ' + callerId : undefined,
    'Timeout: ' + ORIGINATE_TIMEOUT_MS,
    'Async: true',
    'Account: ' + ORIGINATE_ACCOUNT,
    variableParts.length ? 'Variable: ' + variableParts.join('|') : undefined,
  ])

  const response = await sendAmi([loginAction(), originateAction])
  logger.info('Asterisk AMI originate queued for PTDT-Dialer call')
  return { enabled: true, providerCallId, response }
}

export async function hangupBackendOriginatedCall(input: AmiHangupInput): Promise<AmiHangupResult> {
  if (!AMI_ENABLED) return { enabled: false, channels: [] }
  if (!AMI_USERNAME || !AMI_PASSWORD) throw new AppError('Asterisk AMI credentials are not configured', 500)

  const channels = await listConciseChannels()
  const targets = findHangupTargets(channels, input)

  if (targets.length === 0) {
    logger.info('Asterisk AMI hangup found no matching PTDT-Dialer channels')
    return { enabled: true, channels: [] }
  }

  const hangupActions = targets.map(channel => amiCommand([
    'Action: Hangup',
    'Channel: ' + channel,
    'Cause: 16',
  ]))

  const response = await sendAmiFire([loginAction(), ...hangupActions])
  logger.info('Asterisk AMI hangup requested for PTDT-Dialer channels: ' + targets.join(', '))
  return { enabled: true, channels: targets, response }
}
