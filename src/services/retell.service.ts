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

function assertE164(value: string, fieldName: string) {
  if (!E164_REGEX.test(value)) {
    throw new RetellServiceError(`${fieldName} must be in E.164 format, for example +15512943079`, 400)
  }
}

function getRetellConfig() {
  const apiKey = process.env.RETELL_API_KEY
  const fromNumber = process.env.RETELL_FROM_NUMBER
  const apiBaseUrl = process.env.RETELL_API_BASE_URL || 'https://api.retellai.com'

  if (!apiKey) {
    throw new RetellServiceError('RETELL_API_KEY is not configured', 500)
  }

  if (!fromNumber) {
    throw new RetellServiceError('RETELL_FROM_NUMBER is not configured', 500)
  }

  assertE164(fromNumber, 'RETELL_FROM_NUMBER')

  return {
    apiKey,
    fromNumber,
    apiBaseUrl,
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
          let parsedBody: unknown = null

          if (rawBody) {
            try {
              parsedBody = JSON.parse(rawBody)
            } catch {
              parsedBody = rawBody
            }
          }

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

export async function createRetellOutboundPhoneCall(
  input: RetellCreatePhoneCallInput,
): Promise<RetellPhoneCallResponse> {
  const config = getRetellConfig()
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
