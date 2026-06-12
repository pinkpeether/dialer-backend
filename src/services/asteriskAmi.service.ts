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
const TRUNK_NAME = process.env.ASTERISK_TRUNK_NAME || ''
const ORIGINATE_CONTEXT = process.env.ASTERISK_ORIGINATE_CONTEXT || ''
const ORIGINATE_EXTENSION_TEMPLATE = process.env.ASTERISK_ORIGINATE_EXTENSION_TEMPLATE || ''
const ORIGINATE_PRIORITY = process.env.ASTERISK_ORIGINATE_PRIORITY || '1'
const ORIGINATE_ACCOUNT = process.env.ASTERISK_ORIGINATE_ACCOUNT || 'ptdt-dialer'

export type AmiOriginateInput = {
  to: string
  callerId?: string | null
  callId?: number | string | null
  campaignId?: number | string | null
  agentId?: number | string | null
  dynamicCallerIdUsed?: boolean
}

export type AmiOriginateResult = {
  enabled: boolean
  providerCallId: string
  response?: string
}

const sanitizeDialString = (value: string) => value.replace(/[^0-9+*#]/g, '')
const sanitizeCallerId = (value?: string | null) => value ? value.replace(/[\r\n]/g, '').trim() : ''
const actionId = () => 'ami_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)

const renderTemplate = (template: string, input: AmiOriginateInput) => template
  .replaceAll('{to}', sanitizeDialString(input.to))
  .replaceAll('{callerId}', sanitizeCallerId(input.callerId))
  .replaceAll('{trunk}', TRUNK_NAME)
  .replaceAll('{callId}', String(input.callId || ''))
  .replaceAll('{campaignId}', String(input.campaignId || ''))
  .replaceAll('{agentId}', String(input.agentId || ''))

function resolveOriginate(input: AmiOriginateInput) {
  const to = sanitizeDialString(input.to)
  if (!to) throw new AppError('Destination phone number is invalid for AMI originate', 400)

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
        socket.end(amiCommand(['Action: Logoff']))
        if (buffer.includes('Response: Error')) reject(new AppError(buffer.split('\r\n').find(line => line.startsWith('Message:')) || 'Asterisk AMI originate failed', 502))
        else resolve(buffer)
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
    'PTDT_DYNAMIC_CALLER_ID=' + (input.dynamicCallerIdUsed ? '1' : '0'),
    callerId ? 'PTDT_SELECTED_CALLER_ID=' + callerId : '',
  ].filter(Boolean)

  const loginAction = amiCommand([
    'Action: Login',
    'Username: ' + AMI_USERNAME,
    'Secret: ' + AMI_PASSWORD,
    'Events: off',
  ])

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

  const response = await sendAmi([loginAction, originateAction])
  logger.info('Asterisk AMI originate queued for PTDT-Dialer call')
  return { enabled: true, providerCallId, response }
}
