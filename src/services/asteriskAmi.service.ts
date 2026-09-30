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
const TRANSFER_CONTEXT = process.env.ASTERISK_TRANSFER_CONTEXT || 'from-internal'
const TRANSFER_INTERNAL_CONTEXT = process.env.ASTERISK_TRANSFER_INTERNAL_CONTEXT || TRANSFER_CONTEXT
const TRANSFER_EXTERNAL_PREFIX = process.env.ASTERISK_TRANSFER_EXTERNAL_PREFIX || ''
const TRANSFER_PRIORITY = process.env.ASTERISK_TRANSFER_PRIORITY || '1'
const ALLOW_LOOSE_CONTROL_MATCHING = String(process.env.ASTERISK_ALLOW_LOOSE_CONTROL_MATCHING || '').toLowerCase() === 'true'

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

export type AmiTransferInput = {
  callId?: number | string | null
  providerCallId?: string | null
  phone?: string | null
  agentExtension?: string | null
  target: string
}

export type AmiTransferResult = {
  enabled: boolean
  channels: string[]
  target: string
  targetKind: 'extension' | 'external'
  context: string
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
  duration: string
  bridgeId: string
  uniqueId: string
  raw: string
}

type InspectedChannel = ConciseChannel & {
  ptdtCallId?: string
  ptdtAgentExtension?: string
  linkedId?: string
}

const sanitizeDialString = (value: string) => value.replace(/[^0-9+*#]/g, '')
const sanitizeExtension = (value?: string | null) => value ? value.replace(/[^0-9A-Za-z_.-]/g, '').trim() : ''
const sanitizeCallerId = (value?: string | null) => value ? value.replace(/[\r\n]/g, '').trim() : ''
const digitsOnly = (value?: string | null) => value ? value.replace(/\D/g, '') : ''
const actionId = () => 'ami_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
const replaceToken = (value: string, token: string, replacement: string) => value.split(token).join(replacement)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const amiErrorMessage = (buffer: string) => {
  const errorBlock = buffer
    .split(/\r?\n\r?\n/)
    .find(block => block.includes('Response: Error'))
  const message = errorBlock
    ?.split(/\r?\n/)
    .find(line => line.startsWith('Message:'))
    ?.replace(/^Message:\s*/, '')
    .trim()
  return message || 'Asterisk AMI originate failed'
}

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
  const agentExtension = sanitizeExtension(input.agentExtension)
  const to = agentExtension ? digitsOnly(input.to) : sanitizeDialString(input.to)
  if (!to) throw new AppError('Destination phone number is invalid for AMI originate', 400)

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

function loginAction(events: 'on' | 'off' = 'off') {
  return amiCommand([
    'Action: Login',
    'Username: ' + AMI_USERNAME,
    'Secret: ' + AMI_PASSWORD,
    'Events: ' + events,
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
          reject(new AppError(amiErrorMessage(buffer), 502))
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
      if (!settled) reject(new AppError('Asterisk AMI connection closed before originate confirmation', 502))
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
        reject(new AppError(amiErrorMessage(buffer), 502))
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

function sendAmiFire(actions: string[], timeoutMs = 1800): Promise<string> {
  /*
    Hangup is best-effort. Asterisk may return Response: Error for a channel
    that already disappeared, but that must not turn the HTTP call into 502.
  */
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: AMI_HOST, port: AMI_PORT })
    let buffer = ''
    let settled = false

    const finish = (extra = '') => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve([buffer, extra].filter(Boolean).join('\n'))
    }

    const timer = setTimeout(() => finish('AMI hangup best-effort timeout'), timeoutMs)

    socket.setEncoding('utf8')

    socket.on('data', chunk => {
      buffer += chunk
      if (buffer.includes('Response: Goodbye')) {
        finish()
      }
    })

    socket.on('error', err => {
      finish('AMI socket error during hangup: ' + (err instanceof Error ? err.message : String(err)))
    })

    socket.on('connect', () => {
      ;[...actions, logoffAction()].forEach(action => socket.write(action))
    })

    socket.on('close', () => finish())
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
        duration: parts[10] || '',
        /*
          In this Asterisk build, concise field 11 is the bridge id, not a
          channel name. Example:
          PJSIP/1001-...!...!30!0a4165f7-...!1781530311.15
        */
        bridgeId: parts[11] || '',
        uniqueId: parts[12] || '',
        raw: line,
      }
    })
}

const parseAmiBlocks = (raw: string) => raw
  .split(/\r?\n\r?\n/)
  .map(block => block.trim())
  .filter(Boolean)

const amiField = (block: string, name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp('^' + escaped + ':\\s*(.*)$', 'im'))
  return match?.[1]?.trim() || ''
}

function parseCoreShowChannels(raw: string): ConciseChannel[] {
  return parseAmiBlocks(raw)
    .filter(block => /^Event:\s*CoreShowChannel$/im.test(block))
    .map(block => ({
      channel: amiField(block, 'Channel'),
      context: amiField(block, 'Context'),
      exten: amiField(block, 'Extension') || amiField(block, 'Exten'),
      state: amiField(block, 'ChannelStateDesc') || amiField(block, 'ChannelState'),
      application: amiField(block, 'Application'),
      data: amiField(block, 'ApplicationData'),
      callerIdNum: amiField(block, 'CallerIDNum') || amiField(block, 'CallerIDnum'),
      accountCode: amiField(block, 'AccountCode'),
      duration: amiField(block, 'Duration'),
      bridgeId: amiField(block, 'BridgeId'),
      uniqueId: amiField(block, 'Uniqueid') || amiField(block, 'UniqueID'),
      raw: block.replace(/\r?\n/g, ' | '),
    }))
    .filter(item => item.channel)
}

function parseStatusChannels(raw: string): ConciseChannel[] {
  return parseAmiBlocks(raw)
    .filter(block => /^Event:\s*Status$/im.test(block))
    .map(block => ({
      channel: amiField(block, 'Channel'),
      context: amiField(block, 'Context'),
      exten: amiField(block, 'Extension') || amiField(block, 'Exten'),
      state: amiField(block, 'ChannelStateDesc') || amiField(block, 'ChannelState'),
      application: amiField(block, 'Application'),
      data: amiField(block, 'ApplicationData'),
      callerIdNum: amiField(block, 'CallerIDNum') || amiField(block, 'CallerIDnum'),
      accountCode: amiField(block, 'AccountCode'),
      duration: amiField(block, 'Duration'),
      bridgeId: amiField(block, 'BridgeId') || amiField(block, 'BridgeID'),
      uniqueId: amiField(block, 'Uniqueid') || amiField(block, 'UniqueID'),
      raw: block.replace(/\r?\n/g, ' | '),
    }))
    .filter(item => item.channel)
}

async function listConciseChannels() {
  const commandAction = amiCommand([
    'Action: Command',
    'Command: core show channels concise',
  ])

  const response = await sendAmiUntil(
    [loginAction(), commandAction],
    buffer => buffer.includes('--END COMMAND--'),
    Math.max(AMI_TIMEOUT_MS, 1800),
  )

  return parseConciseChannels(response)
}

async function listCoreShowChannels() {
  const coreShowAction = amiCommand([
    'Action: CoreShowChannels',
    'ActionID: ' + actionId(),
  ])

  const response = await sendAmiUntil(
    [loginAction('on'), coreShowAction],
    buffer => buffer.includes('Event: CoreShowChannelsComplete'),
    Math.max(AMI_TIMEOUT_MS, 1800),
  )

  return parseCoreShowChannels(response)
}

async function listStatusChannels() {
  const statusAction = amiCommand([
    'Action: Status',
    'ActionID: ' + actionId(),
  ])

  const response = await sendAmiUntil(
    [loginAction('on'), statusAction],
    buffer => buffer.includes('Event: StatusComplete'),
    Math.max(AMI_TIMEOUT_MS, 1800),
  )

  return parseStatusChannels(response)
}

async function listAmiChannels() {
  const coreChannels = await listCoreShowChannels().catch(err => {
    logger.warn(`AMI CoreShowChannels failed, falling back to Status action: ${err}`)
    return []
  })
  if (coreChannels.length > 0) return coreChannels

  const statusChannels = await listStatusChannels().catch(err => {
    logger.warn(`AMI Status failed, falling back to concise command: ${err}`)
    return []
  })
  if (statusChannels.length > 0) return statusChannels

  return listConciseChannels()
}

const getAmiValue = (buffer: string) => {
  const blocks = buffer.split(/\r?\n\r?\n/)
  for (const block of blocks) {
    if (!block.includes('Response: Success')) continue
    const value = block
      .split(/\r?\n/)
      .find(line => /^Value:/i.test(line))
      ?.replace(/^Value:\s*/i, '')
      .trim()
    if (value !== undefined) return value
  }
  return ''
}

async function getChannelValue(channel: string, variable: string) {
  const action = amiCommand([
    'Action: Getvar',
    'ActionID: ' + actionId(),
    'Channel: ' + channel,
    'Variable: ' + variable,
  ])

  try {
    const response = await sendAmiUntil(
      [loginAction(), action],
      buffer => buffer.includes('Response: Success') || buffer.includes('Response: Error'),
      Math.max(AMI_TIMEOUT_MS, 1800),
    )
    return getAmiValue(response)
  } catch {
    return ''
  }
}

async function inspectControlChannels(channels: ConciseChannel[]): Promise<InspectedChannel[]> {
  const inspectable = channels
    .filter(item => item.channel && (item.channel.startsWith('PJSIP/') || item.channel.startsWith('Local/')))
    .slice(0, 40)

  return Promise.all(inspectable.map(async item => ({
    ...item,
    ptdtCallId: await getChannelValue(item.channel, 'PTDT_CALL_ID'),
    ptdtAgentExtension: await getChannelValue(item.channel, 'PTDT_AGENT_EXTENSION'),
    linkedId: await getChannelValue(item.channel, 'CHANNEL(linkedid)'),
  })))
}

function findControlTargets(channels: InspectedChannel[], input: AmiHangupInput) {
  const phoneDigits = digitsOnly(input.phone)
  const agentExtension = sanitizeExtension(input.agentExtension)
  const callId = input.callId ? String(input.callId) : ''
  const providerCallId = input.providerCallId ? String(input.providerCallId) : ''
  const hasStrongInput = Boolean(callId || providerCallId)
  if (!hasStrongInput) return []

  const matched = channels.filter(item => {
    const blob = [
      item.channel,
      item.context,
      item.exten,
      item.application,
      item.data,
      item.callerIdNum,
      item.accountCode,
      item.duration,
      item.bridgeId,
      item.uniqueId,
      item.linkedId,
      item.ptdtCallId,
      item.ptdtAgentExtension,
      item.raw,
    ].join(' ')

    const matchesCallId = Boolean(callId && item.ptdtCallId === callId)
    const matchesProvider = Boolean(providerCallId && (
      item.uniqueId === providerCallId ||
      item.linkedId === providerCallId ||
      item.bridgeId === providerCallId ||
      blob.includes(providerCallId)
    ))

    return matchesCallId || matchesProvider
  })

  const bridgeIds = new Set(matched.map(item => item.bridgeId).filter(Boolean))
  const targetSet = new Set(matched.map(item => item.channel).filter(Boolean))

  // Connected calls share bridge id. Expand any matched leg to all real channels in same bridge.
  channels.forEach(item => {
    if (item.channel && item.bridgeId && bridgeIds.has(item.bridgeId)) {
      targetSet.add(item.channel)
    }
  })

  /*
    Legacy fallback is intentionally disabled by default. Phone/agent matching
    can hit the wrong call when two calls share a trunk or agent close together.
  */
  if (targetSet.size === 0 && ALLOW_LOOSE_CONTROL_MATCHING) {
    const fallbackBridgeIds = new Set<string>()

    channels.forEach(item => {
      const rawDigits = digitsOnly(item.raw)
      const isAgentLeg = Boolean(agentExtension && (
        item.channel.includes('/' + agentExtension + '-') ||
        item.exten === agentExtension ||
        item.data.includes('/' + agentExtension)
      ))
      const isDestinationLeg = Boolean(phoneDigits && rawDigits.includes(phoneDigits))

      if (item.channel && (isAgentLeg || isDestinationLeg)) {
        targetSet.add(item.channel)
        if (item.bridgeId) fallbackBridgeIds.add(item.bridgeId)
      }
    })

    channels.forEach(item => {
      if (item.channel && item.bridgeId && fallbackBridgeIds.has(item.bridgeId)) {
        targetSet.add(item.channel)
      }
    })
  }

  return Array.from(targetSet).filter(channel => channel.startsWith('PJSIP/') || channel.startsWith('Local/'))
}


export async function originateOutboundCall(input: AmiOriginateInput): Promise<AmiOriginateResult> {
  const providerCallId = actionId()

  if (!AMI_ENABLED) {
    throw new AppError('Asterisk AMI is disabled. Backend-originated outbound calling is not available.', 503)
  }

  if (!AMI_USERNAME || !AMI_PASSWORD) throw new AppError('Asterisk AMI credentials are not configured', 500)

  const originate = resolveOriginate(input)
  const callerId = sanitizeCallerId(input.callerId)

  const variableParts = [
    '__PTDT_CALL_ID=' + String(input.callId || ''),
    '__PTDT_CAMPAIGN_ID=' + String(input.campaignId || ''),
    '__PTDT_AGENT_ID=' + String(input.agentId || ''),
    '__PTDT_AGENT_EXTENSION=' + sanitizeExtension(input.agentExtension),
    '__PTDT_DYNAMIC_CALLER_ID=' + (input.dynamicCallerIdUsed ? '1' : '0'),
    callerId ? '__PTDT_SELECTED_CALLER_ID=' + callerId : '',
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
    ...variableParts.map(variable => 'Variable: ' + variable),
  ])

  const response = await sendAmi([loginAction(), originateAction])
  logger.info('Asterisk AMI originate queued for PTDT-Dialer call')
  return { enabled: true, providerCallId, response }
}

export async function hangupBackendOriginatedCall(input: AmiHangupInput): Promise<AmiHangupResult> {
  if (!AMI_ENABLED) return { enabled: false, channels: [] }
  if (!AMI_USERNAME || !AMI_PASSWORD) throw new AppError('Asterisk AMI credentials are not configured', 500)

  const makeHangupActions = (targets: string[]) => targets.map(channel => amiCommand([
    'Action: Hangup',
    'Channel: ' + channel,
    'Cause: 16',
  ]))

  const firstChannels = await inspectControlChannels(await listAmiChannels())
  const firstTargets = findControlTargets(firstChannels, input)

  if (firstTargets.length === 0) {
    const noMatch = 'NO_MATCH: no PTDT-Dialer AMI channels matched. Active channels:\n' +
      firstChannels.map(item => item.raw).join('\n').slice(0, 2500)

    logger.info('Asterisk AMI hangup found no matching PTDT-Dialer channels')
    return { enabled: true, channels: [], response: noMatch }
  }

  const firstResponse = await sendAmiFire([loginAction(), ...makeHangupActions(firstTargets)])

  await sleep(300)

  const secondChannels = await listAmiChannels()
    .then(channels => inspectControlChannels(channels))
    .catch(() => [])
  const secondTargets = findControlTargets(secondChannels, input).filter(channel => !firstTargets.includes(channel))

  const secondResponse = secondTargets.length > 0
    ? await sendAmiFire([loginAction(), ...makeHangupActions(secondTargets)])
    : ''

  const targets = Array.from(new Set([...firstTargets, ...secondTargets]))

  logger.info('Asterisk AMI hangup requested for PTDT-Dialer channels: ' + targets.join(', '))
  return {
    enabled: true,
    channels: targets,
    response: [firstResponse, secondResponse].filter(Boolean).join('\n---SECOND_PASS---\n'),
  }
}



function resolveTransferTarget(target: string) {
  const raw = sanitizeDialString(target)
  if (!raw) throw new AppError('Transfer destination is required', 400)

  /*
    Internal extensions are intentionally kept narrow so a 10/11-digit PSTN
    number is never mistaken for an extension.
  */
  if (/^[0-9]{2,6}$/.test(raw)) {
    return {
      target: raw,
      targetKind: 'extension' as const,
      context: TRANSFER_INTERNAL_CONTEXT,
      exten: raw,
    }
  }

  const externalDigits = digitsOnly(raw)
  if (externalDigits.length < 7 || externalDigits.length > 15) {
    throw new AppError('Transfer phone number must be a valid extension or phone number', 400)
  }

  return {
    target: raw,
    targetKind: 'external' as const,
    context: TRANSFER_CONTEXT,
    exten: TRANSFER_EXTERNAL_PREFIX + externalDigits,
  }
}

function pickTransferChannel(channels: string[], agentExtension?: string | null) {
  const agent = sanitizeExtension(agentExtension)
  if (agent) {
    const agentChannel = channels.find(channel => channel.startsWith(`PJSIP/${agent}-`) || channel === `PJSIP/${agent}`)
    if (agentChannel) return agentChannel
  }

  return (
    channels.find(channel => channel.startsWith('PJSIP/')) ||
    channels.find(channel => channel.startsWith('Local/')) ||
    channels[0]
  )
}

export async function transferBackendOriginatedCall(input: AmiTransferInput): Promise<AmiTransferResult> {
  const resolved = resolveTransferTarget(input.target)

  if (!AMI_ENABLED) {
    return {
      enabled: false,
      channels: [],
      target: resolved.target,
      targetKind: resolved.targetKind,
      context: resolved.context,
      response: 'Asterisk AMI is disabled',
    }
  }

  const channels = findControlTargets(await inspectControlChannels(await listAmiChannels()), input)
  const channel = pickTransferChannel(channels, input.agentExtension)

  if (!channel) {
    throw new AppError('No active call channel found for transfer', 404)
  }

  const transferAction = amiCommand([
    'Action: BlindTransfer',
    'ActionID: ' + actionId(),
    'Channel: ' + channel,
    'Context: ' + resolved.context,
    'Exten: ' + resolved.exten,
    'Priority: ' + TRANSFER_PRIORITY,
  ])

  const response = await sendAmiUntil(
    [loginAction(), transferAction, logoffAction()],
    buffer => buffer.includes('Response: Success') || buffer.includes('Response: Error'),
    Math.max(AMI_TIMEOUT_MS, 3500),
  )

  logger.info('Asterisk AMI transfer requested for PTDT-Dialer call')

  return {
    enabled: true,
    channels: [channel],
    target: resolved.target,
    targetKind: resolved.targetKind,
    context: resolved.context,
    response,
  }
}
