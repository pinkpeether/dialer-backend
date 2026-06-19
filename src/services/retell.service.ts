import crypto from 'crypto'
import https from 'https'

export interface RetellCreatePhoneCallInput {
  toNumber: string
  fromNumber?: string
  overrideAgentId?: string
  metadata?: Record<string, unknown>
  retellLlmDynamicVariables?: Record<string, string>
  customSipHeaders?: Record<string, string>
}

export interface RetellPhoneCallResponse {
  call_id?: string
  call_status?: string
  call_type?: string
  direction?: string
  from_number?: string
  to_number?: string
  agent_id?: string
  agent_name?: string
  agent_version?: number
  telephony_identifier?: Record<string, unknown>
  metadata?: Record<string, unknown>
  retell_llm_dynamic_variables?: Record<string, unknown>
  start_timestamp?: number
  end_timestamp?: number
  duration_ms?: number
  transcript?: string
  transcript_object?: unknown[]
  transcript_with_tool_calls?: unknown[]
  recording_url?: string
  recording_multi_channel_url?: string
  disconnection_reason?: string
  transfer_destination?: string | null
  call_analysis?: Record<string, unknown>
  [key: string]: unknown
}

export class RetellServiceError extends Error {
  statusCode: number
  payload?: unknown

  constructor(message: string, statusCode = 500, payload?: unknown) {
    super(message)
    this.name = 'RetellServiceError'
    this.statusCode = statusCode
    this.payload = payload
  }
}

const E164_REGEX = /^\+[1-9]\d{7,14}$/
const RETELL_CALL_ID_REGEX = /^[A-Za-z0-9_-]{8,160}$/

function assertE164(value: string, fieldName: string) {
  if (!E164_REGEX.test(value)) {
    throw new RetellServiceError(`${fieldName} must be in E.164 format, for example +15512943079`, 400)
  }
}

function assertRetellCallId(value: string) {
  if (!RETELL_CALL_ID_REGEX.test(value)) {
    throw new RetellServiceError('Retell callId format is invalid', 400)
  }
}

function getRetellApiConfig() {
  const apiKey = process.env.RETELL_API_KEY
  const apiBaseUrl = process.env.RETELL_API_BASE_URL || 'https://api.retellai.com'

  if (!apiKey) {
    throw new RetellServiceError('RETELL_API_KEY is not configured', 500)
  }

  return {
    apiKey,
    apiBaseUrl,
  }
}

function getRetellOutboundConfig() {
  const apiConfig = getRetellApiConfig()
  const fromNumber = process.env.RETELL_FROM_NUMBER

  if (!fromNumber) {
    throw new RetellServiceError('RETELL_FROM_NUMBER is not configured', 500)
  }

  assertE164(fromNumber, 'RETELL_FROM_NUMBER')

  return {
    ...apiConfig,
    fromNumber,
  }
}

function parseResponseBody(rawBody: string): unknown {
  if (!rawBody) return null

  try {
    return JSON.parse(rawBody)
  } catch {
    return rawBody
  }
}

function postJson<TResponse>(
  apiBaseUrl: string,
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, apiBaseUrl)
    const payload = JSON.stringify(body)

    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      res => {
        const chunks: Buffer[] = []

        res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))

        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8')
          const parsedBody = parseResponseBody(rawBody)
          const statusCode = res.statusCode || 500

          if (statusCode < 200 || statusCode >= 300) {
            reject(new RetellServiceError('Retell API request failed', statusCode, parsedBody))
            return
          }

          resolve(parsedBody as TResponse)
        })
      },
    )

    req.setTimeout(30000, () => {
      req.destroy(new RetellServiceError('Retell API request timed out', 504))
    })

    req.on('error', err => {
      if (err instanceof RetellServiceError) {
        reject(err)
        return
      }
      reject(new RetellServiceError(err.message || 'Retell API request failed', 502))
    })

    req.write(payload)
    req.end()
  })
}

function getJson<TResponse>(
  apiBaseUrl: string,
  apiKey: string,
  path: string,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, apiBaseUrl)

    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      },
      res => {
        const chunks: Buffer[] = []

        res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))

        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8')
          const parsedBody = parseResponseBody(rawBody)
          const statusCode = res.statusCode || 500

          if (statusCode < 200 || statusCode >= 300) {
            reject(new RetellServiceError('Retell API request failed', statusCode, parsedBody))
            return
          }

          resolve(parsedBody as TResponse)
        })
      },
    )

    req.setTimeout(30000, () => {
      req.destroy(new RetellServiceError('Retell API request timed out', 504))
    })

    req.on('error', err => {
      if (err instanceof RetellServiceError) {
        reject(err)
        return
      }
      reject(new RetellServiceError(err.message || 'Retell API request failed', 502))
    })

    req.end()
  })
}

export function verifyRetellWebhookSignature(rawBody: string, signatureHeader?: string | null) {
  if (!signatureHeader) return false

  const { apiKey } = getRetellApiConfig()
  const match = signatureHeader.match(/^v=(\d+),d=([a-fA-F0-9]+)$/)

  if (!match) return false

  const timestamp = match[1]
  const digest = match[2]
  const timestampMs = Number(timestamp)

  if (!Number.isFinite(timestampMs)) return false

  const nowMs = Date.now()
  const fiveMinutesMs = 5 * 60 * 1000

  if (Math.abs(nowMs - timestampMs) > fiveMinutesMs) {
    return false
  }

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(`${rawBody}${timestamp}`)
    .digest()

  const actual = Buffer.from(digest, 'hex')

  if (actual.length !== expected.length) {
    return false
  }

  return crypto.timingSafeEqual(actual, expected)
}

export async function createRetellOutboundPhoneCall(
  input: RetellCreatePhoneCallInput,
): Promise<RetellPhoneCallResponse> {
  const config = getRetellOutboundConfig()
  const toNumber = input.toNumber.trim()
  const fromNumber = (input.fromNumber || config.fromNumber).trim()

  assertE164(toNumber, 'toNumber')
  assertE164(fromNumber, 'fromNumber')

  const body: Record<string, unknown> = {
    from_number: fromNumber,
    to_number: toNumber,
  }

  if (input.overrideAgentId) {
    body.override_agent_id = input.overrideAgentId
  }

  if (input.metadata && Object.keys(input.metadata).length > 0) {
    body.metadata = input.metadata
  }

  if (input.retellLlmDynamicVariables && Object.keys(input.retellLlmDynamicVariables).length > 0) {
    body.retell_llm_dynamic_variables = input.retellLlmDynamicVariables
  }

  if (input.customSipHeaders && Object.keys(input.customSipHeaders).length > 0) {
    body.custom_sip_headers = input.customSipHeaders
  }

  return postJson<RetellPhoneCallResponse>(
    config.apiBaseUrl,
    config.apiKey,
    '/v2/create-phone-call',
    body,
  )
}

export async function getRetellPhoneCall(callId: string): Promise<RetellPhoneCallResponse> {
  const cleanCallId = callId.trim()
  assertRetellCallId(cleanCallId)

  const config = getRetellApiConfig()

  return getJson<RetellPhoneCallResponse>(
    config.apiBaseUrl,
    config.apiKey,
    `/v2/get-call/${encodeURIComponent(cleanCallId)}`,
  )
}
