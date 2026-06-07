import { AppError } from '../middleware/errorHandler'

type SmsSendInput = {
  from?: string
  to: string[] | string
  message: string
}

const truthy = (value: string | undefined) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase())
const publicProviderName = () => process.env.SMS_PROVIDER || 'PTDT Dialer'

const getProviderBaseUrl = () => {
  const raw = process.env.ILLYVOIP_SMS_API_BASE_URL || 'https://illyvoip.com/my/api.php'
  return new URL(raw)
}

const getApiKey = () => {
  const apiKey = process.env.ILLYVOIP_SMS_API_KEY
  if (!apiKey) throw new AppError('SMS API key is not configured', 500)
  return apiKey
}

const normalizeRecipient = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('+')) return trimmed

  const digitsOnly = trimmed.replace(/[^\d]/g, '')
  if (!digitsOnly) return trimmed

  const defaultCountryCode = String(process.env.ILLYVOIP_SMS_DEFAULT_COUNTRY_CODE || '').trim()
  if (defaultCountryCode) return `+${defaultCountryCode}${digitsOnly}`
  return `+${digitsOnly}`
}

const normalizeRecipients = (input: string[] | string) => {
  const list = Array.isArray(input) ? input : input.split(/[,\n]/g)
  const recipients = list
    .map(item => normalizeRecipient(String(item || '')))
    .filter(Boolean)

  if (recipients.length === 0) {
    throw new AppError('At least one valid recipient is required', 400)
  }

  return recipients
}

const getMaxMessageLength = () => Number(process.env.SMS_MAX_MESSAGE_LENGTH || 1600)

const ensureEnabled = () => {
  if (!truthy(process.env.SMS_ENABLED || 'true')) {
    throw new AppError('SMS sending is disabled in the current environment', 403)
  }
}

const buildUrl = (subaction: 'send' | 'status', messageId?: string) => {
  const url = getProviderBaseUrl()
  url.searchParams.set('action', 'sms_api')
  url.searchParams.set('subaction', subaction)
  if (messageId) url.searchParams.set('message_id', messageId)
  return url.toString()
}

async function parseJsonResponse(response: Response) {
  const text = await response.text()
  let body: unknown = null

  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body && typeof (body as { message?: unknown }).message === 'string'
        ? String((body as { message: string }).message)
        : `SMS provider request failed with status ${response.status}`
    throw new AppError(message, response.status)
  }

  return body
}

export const getSmsConfig = () => ({
  enabled: truthy(process.env.SMS_ENABLED || 'true'),
  provider: publicProviderName(),
  defaultFrom: process.env.ILLYVOIP_SMS_DEFAULT_FROM || '',
  maxMessageLength: getMaxMessageLength(),
  defaultCountryCode: process.env.ILLYVOIP_SMS_DEFAULT_COUNTRY_CODE || '',
  statusLookupEnabled: true,
})

export const sendSms = async (input: SmsSendInput) => {
  ensureEnabled()

  const from = String(input.from || process.env.ILLYVOIP_SMS_DEFAULT_FROM || '').trim()
  const message = String(input.message || '').trim()
  const to = normalizeRecipients(input.to)

  if (!from) throw new AppError('From is required', 400)
  if (!message) throw new AppError('Message is required', 400)
  if (message.length > getMaxMessageLength()) {
    throw new AppError(`Message exceeds the maximum allowed length of ${getMaxMessageLength()} characters`, 400)
  }

  const response = await fetch(buildUrl('send'), {
    method: 'POST',
    headers: {
      'X-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, message }),
  })

  const body = await parseJsonResponse(response) as {
    status?: string
    queued_message_ids?: string[]
    total_cost?: number
    [key: string]: unknown
  }

  return {
    provider: publicProviderName(),
    request: { from, to, messageLength: message.length },
    providerStatus: body.status || 'unknown',
    queuedMessageIds: Array.isArray(body.queued_message_ids) ? body.queued_message_ids : [],
    totalCost: typeof body.total_cost === 'number' ? body.total_cost : null,
    raw: body,
  }
}

export const getSmsStatus = async (messageId: string) => {
  ensureEnabled()

  const trimmed = String(messageId || '').trim()
  if (!trimmed) throw new AppError('messageId is required', 400)

  const response = await fetch(buildUrl('status', trimmed), {
    method: 'GET',
    headers: {
      'X-API-KEY': getApiKey(),
    },
  })

  const body = await parseJsonResponse(response) as Record<string, unknown>

  return {
    provider: publicProviderName(),
    messageId: String(body.message_id || trimmed),
    providerStatus: String(body.status || 'unknown'),
    smsStatus: String(body.sms_status || 'unknown'),
    from: String(body.from || ''),
    to: String(body.to || ''),
    createdDate: String(body.created_date || ''),
    providerData: typeof body.provider_data === 'object' && body.provider_data ? body.provider_data : {},
    raw: body,
  }
}
