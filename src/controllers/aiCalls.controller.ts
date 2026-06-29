import { Request, Response, NextFunction } from 'express'
import {
  createAiCallLogFromOutboundRequest,
  getAiCallLogRecordById,
  listAiCallLogRecords,
  upsertAiCallLogFromRetellWebhook,
} from '../services/aiCallLog.service'
import * as Scope from '../services/commercialScope.service'
import {
  createRetellOutboundPhoneCall,
  getRetellPhoneCall,
  RetellPhoneCallResponse,
  RetellServiceError,
  verifyRetellWebhookSignature,
} from '../services/retell.service'

const RETELL_WEBHOOK_EVENTS = new Set([
  'call_started',
  'call_ended',
  'call_analyzed',
  'transcript_updated',
  'transfer_started',
  'transfer_bridged',
  'transfer_cancelled',
  'transfer_ended',
])

function maskPhoneNumber(phoneNumber?: string) {
  if (!phoneNumber) return null
  return phoneNumber.replace(/^(\+\d{2})(\d+)(\d{3})$/, (_match, prefix, middle, suffix) => {
    return `${prefix}${'*'.repeat(String(middle).length)}${suffix}`
  })
}

function getStringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getRawBody(req: Request) {
  const rawBody = (req as Request & { rawBody?: string }).rawBody
  return typeof rawBody === 'string' ? rawBody : ''
}

function assertTestEndpointEnabled(req: Request) {
  if (process.env.RETELL_TEST_OUTBOUND_ENABLED !== 'true') {
    throw new RetellServiceError('Retell test outbound endpoint is disabled', 403)
  }

  const expectedSecret = process.env.AI_CALLS_TEST_SECRET

  if (!expectedSecret) {
    throw new RetellServiceError('AI_CALLS_TEST_SECRET is not configured', 500)
  }

  const providedSecret = req.header('X-PTDT-AI-Test-Secret')

  if (providedSecret !== expectedSecret) {
    throw new RetellServiceError('Unauthorized AI call test request', 401)
  }
}

function assertRetellDebugFetchEnabled(req: Request) {
  if (process.env.RETELL_DEBUG_FETCH_ENABLED !== 'true') {
    throw new RetellServiceError('Retell debug fetch endpoint is disabled', 403)
  }

  const expectedSecret = process.env.AI_CALLS_TEST_SECRET

  if (!expectedSecret) {
    throw new RetellServiceError('AI_CALLS_TEST_SECRET is not configured', 500)
  }

  const providedSecret = req.header('X-PTDT-AI-Test-Secret')

  if (providedSecret !== expectedSecret) {
    throw new RetellServiceError('Unauthorized Retell debug fetch request', 401)
  }
}

function assertRetellWebhookAccess(req: Request) {
  if (process.env.RETELL_WEBHOOK_ENABLED !== 'true') {
    throw new RetellServiceError('Retell webhook endpoint is disabled', 403)
  }

  const signature = req.header('x-retell-signature')

  if (signature) {
    const rawBody = getRawBody(req)

    if (!rawBody) {
      throw new RetellServiceError('Raw request body is not available for Retell signature verification', 500)
    }

    if (!verifyRetellWebhookSignature(rawBody, signature)) {
      throw new RetellServiceError('Invalid Retell webhook signature', 401)
    }

    return 'retell-signature'
  }

  const expectedSecret = process.env.RETELL_WEBHOOK_SECRET
  const providedSecret = req.header('X-PTDT-Retell-Webhook-Secret')

  if (expectedSecret && providedSecret === expectedSecret) {
    return 'ptdt-test-secret'
  }

  throw new RetellServiceError('Unauthorized Retell webhook request', 401)
}

function summarizeRetellCall(call: RetellPhoneCallResponse | Record<string, unknown> | null) {
  if (!call) {
    return {
      retellCallId: null,
      callStatus: null,
      callType: null,
      direction: null,
      fromNumber: null,
      toNumber: null,
      maskedToNumber: null,
      agentId: null,
      agentName: null,
      durationMs: null,
      disconnectionReason: null,
      transferDestination: null,
      hasTranscript: false,
      transcriptLength: 0,
      hasRecordingUrl: false,
      hasCallAnalysis: false,
    }
  }

  const transcript = getStringField(call.transcript)
  const recordingUrl = getStringField(call.recording_url)
  const toNumber = getStringField(call.to_number)

  return {
    retellCallId: getStringField(call.call_id) || null,
    callStatus: getStringField(call.call_status) || null,
    callType: getStringField(call.call_type) || null,
    direction: getStringField(call.direction) || null,
    fromNumber: getStringField(call.from_number) || null,
    toNumber: toNumber || null,
    maskedToNumber: maskPhoneNumber(toNumber),
    agentId: getStringField(call.agent_id) || null,
    agentName: getStringField(call.agent_name) || null,
    durationMs: typeof call.duration_ms === 'number' ? call.duration_ms : null,
    disconnectionReason: getStringField(call.disconnection_reason) || null,
    transferDestination: getStringField(call.transfer_destination) || null,
    hasTranscript: transcript.length > 0,
    transcriptLength: transcript.length,
    hasRecordingUrl: recordingUrl.length > 0,
    hasCallAnalysis: isRecord(call.call_analysis),
  }
}

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/
const SAFE_ASSISTANT_ID_REGEX = /^[A-Za-z0-9_-]{1,120}$/

type AiCallRequestWithUser = Request & {
  user?: {
    id: number
    email?: string
    role?: string
  }
}

function parseCsvEnv(name: string) {
  return (process.env[name] || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function assertE164Phone(value: string, label: string) {
  if (!E164_PHONE_REGEX.test(value)) {
    throw new RetellServiceError(`${label} must be in E.164 format, for example +15512943079`, 400)
  }
}

function assertAiOutboundEnabled() {
  if (process.env.AI_OUTBOUND_CALLS_ENABLED !== 'true') {
    throw new RetellServiceError('AI outbound calls are disabled', 403)
  }
}

function resolveOutboundFromNumber(inputFromNumber: string) {
  const defaultFromNumber = getStringField(process.env.RETELL_FROM_NUMBER)
  const fromNumber = inputFromNumber || defaultFromNumber

  if (!fromNumber) {
    throw new RetellServiceError('Caller ID is not configured', 500)
  }

  assertE164Phone(fromNumber, 'Caller ID')

  const allowedFromNumbers = parseCsvEnv('AI_OUTBOUND_ALLOWED_FROM_NUMBERS')

  if (allowedFromNumbers.length > 0 && !allowedFromNumbers.includes(fromNumber)) {
    throw new RetellServiceError('Caller ID is not allowed', 403)
  }

  if (allowedFromNumbers.length === 0 && defaultFromNumber && fromNumber !== defaultFromNumber) {
    throw new RetellServiceError('Caller ID is not allowed', 403)
  }

  return fromNumber
}

function resolveTransferDestination(value: string) {
  if (!value) {
    throw new RetellServiceError('Transfer number is required', 400)
  }

  assertE164Phone(value, 'Transfer number')

  const allowedTransferTargets = parseCsvEnv('AI_OUTBOUND_ALLOWED_TRANSFER_TARGETS')

  if (allowedTransferTargets.length === 0) {
    throw new RetellServiceError('AI transfer targets are not configured', 500)
  }

  if (!allowedTransferTargets.includes(value)) {
    throw new RetellServiceError('Transfer number is not allowed', 403)
  }

  return value
}

function resolveAssistantId(value: string) {
  if (!value || value === 'default') return 'default'

  if (!SAFE_ASSISTANT_ID_REGEX.test(value)) {
    throw new RetellServiceError('Assistant selection is invalid', 400)
  }

  return value
}

function handleAiOutboundError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof RetellServiceError) {
    const providerFacingFailure = Boolean(error.payload) || error.message.toLowerCase().includes('retell')
    const statusCode = providerFacingFailure ? 502 : error.statusCode
    const message = providerFacingFailure ? 'Unable to start AI call' : error.message

    res.status(statusCode).json({
      success: false,
      message,
      statusCode,
    })
    return
  }

  next(error)
}

function handleRetellError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof RetellServiceError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      provider: 'retell',
      statusCode: error.statusCode,
      details: error.payload || null,
    })
    return
  }

  next(error)
}

export async function testOutboundAiCall(req: Request, res: Response, next: NextFunction) {
  try {
    assertTestEndpointEnabled(req)

    const toNumber = getStringField(req.body?.toNumber)
    const overrideAgentId = getStringField(req.body?.overrideAgentId)

    const response = await createRetellOutboundPhoneCall({
      toNumber,
      overrideAgentId: overrideAgentId || undefined,
      metadata: {
        source: 'ptdt_backend_test',
        sprint: 'phase5_sprint2_retell_backend_trigger',
        requested_at: new Date().toISOString(),
      },
    })

    res.status(201).json({
      success: true,
      message: 'Retell outbound AI call triggered',
      provider: 'retell',
      ...summarizeRetellCall(response),
      agentVersion: response.agent_version || null,
      telephonyIdentifier: response.telephony_identifier || null,
    })
  } catch (error) {
    handleRetellError(error, res, next)
  }
}


export async function startOutboundAiCall(req: Request, res: Response, next: NextFunction) {
  try {
    assertAiOutboundEnabled()

    const actor = (req as AiCallRequestWithUser).user
    const toNumber = getStringField(req.body?.toNumber)
    const fromNumber = resolveOutboundFromNumber(getStringField(req.body?.fromNumber))
    const transferDestination = resolveTransferDestination(
      getStringField(req.body?.transferDestination) || getStringField(req.body?.transferTo),
    )
    const assistantId = resolveAssistantId(getStringField(req.body?.assistantId))

    assertE164Phone(toNumber, 'Customer number')

    const call = await createRetellOutboundPhoneCall({
      toNumber,
      fromNumber,
      overrideAgentId: assistantId === 'default' ? undefined : assistantId,
      metadata: {
        source: 'ptdt-dialer',
        requested_by: actor?.id ? String(actor.id) : 'unknown',
        requested_role: actor?.role || 'unknown',
        requested_at: new Date().toISOString(),
      },
      retellLlmDynamicVariables: {
        transfer_destination: transferDestination,
        transferDestination,
        customer_number: toNumber,
        from_number: fromNumber,
      },
    })

    let storedAiCallLog = null

    try {
      const commercialAccountId = await Scope.primaryAccountIdForActor(actor)
      storedAiCallLog = await createAiCallLogFromOutboundRequest({
        call,
        request: {
          actorId: typeof actor?.id === 'number' ? actor.id : undefined,
          commercialAccountId,
          toNumber,
          fromNumber,
          transferDestination,
          assistantId,
          source: 'ptdt-dialer',
        },
      })
    } catch (error) {
      console.warn('[ai-call-outbound] AI call log storage failed', {
        error: error instanceof Error ? error.message : 'Unknown storage error',
      })
    }

    res.status(201).json({
      success: true,
      message: 'AI call started',
      callId: storedAiCallLog?.id ?? null,
      displayCallId: storedAiCallLog?.id ? `#${storedAiCallLog.id}` : null,
      status: getStringField(call.call_status) || 'queued',
      toNumber: maskPhoneNumber(toNumber),
      fromNumber: maskPhoneNumber(fromNumber),
      transferDestination: maskPhoneNumber(transferDestination),
    })
  } catch (error) {
    handleAiOutboundError(error, res, next)
  }
}

export async function receiveRetellWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const verificationMode = assertRetellWebhookAccess(req)
    const event = getStringField(req.body?.event)
    const call = isRecord(req.body?.call) ? req.body.call : null
    const callId = call ? getStringField(call.call_id) : ''

    if (!event) {
      throw new RetellServiceError('Retell webhook event is missing', 400)
    }

    if (!RETELL_WEBHOOK_EVENTS.has(event)) {
      console.warn('[retell-webhook] Unknown event received', {
        event,
        callId: callId || null,
      })
    }

    let fetchedCallSummary = null
    let fetchError = null

    if (callId && process.env.RETELL_WEBHOOK_FETCH_CALL === 'true') {
      try {
        const fetchedCall = await getRetellPhoneCall(callId)
        fetchedCallSummary = summarizeRetellCall(fetchedCall)
      } catch (error) {
        fetchError = error instanceof Error ? error.message : 'Retell call fetch failed'
      }
    }

    const webhookSummary = summarizeRetellCall(call)
    let storedAiCallLog = null
    let storageError = null

    if (callId && call) {
      try {
        storedAiCallLog = await upsertAiCallLogFromRetellWebhook({
          event,
          call,
          rawPayload: isRecord(req.body) ? req.body : {},
        })
      } catch (error) {
        storageError = error instanceof Error ? error.message : 'AI call log storage failed'
      }
    }

    console.log('[retell-webhook] Received Retell webhook', {
      event,
      callId: callId || null,
      callStatus: webhookSummary.callStatus,
      disconnectionReason: webhookSummary.disconnectionReason,
      hasTranscript: webhookSummary.hasTranscript,
      hasRecordingUrl: webhookSummary.hasRecordingUrl,
      hasCallAnalysis: webhookSummary.hasCallAnalysis,
      verificationMode,
    })

    res.status(200).json({
      success: true,
      message: 'Retell webhook received',
      provider: 'retell',
      event,
      knownEvent: RETELL_WEBHOOK_EVENTS.has(event),
      verificationMode,
      webhookCall: webhookSummary,
      fetchedCall: fetchedCallSummary,
      fetchError,
      stored: Boolean(storedAiCallLog),
      storageMode: 'ai-call-log',
      storedAiCallLog,
      storageError,
    })
  } catch (error) {
    handleRetellError(error, res, next)
  }
}

export async function getRetellCallDebug(req: Request, res: Response, next: NextFunction) {
  try {
    assertRetellDebugFetchEnabled(req)

    const callId = getStringField(req.params.callId)
    const call = await getRetellPhoneCall(callId)

    res.status(200).json({
      success: true,
      message: 'Retell call fetched',
      provider: 'retell',
      call: summarizeRetellCall(call),
      analysis: isRecord(call.call_analysis) ? call.call_analysis : null,
      rawReturned: false,
    })
  } catch (error) {
    handleRetellError(error, res, next)
  }
}

function getIntegerQuery(value: unknown, fallback: number) {
  const parsed = Number.parseInt(getStringField(value), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getBooleanQuery(value: unknown) {
  const text = getStringField(value).toLowerCase()

  if (text === 'true') return true
  if (text === 'false') return false

  return undefined
}

export async function listAiCallLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const page = getIntegerQuery(req.query.page, 1)
    const limit = getIntegerQuery(req.query.limit, 25)
    const includeRaw = getBooleanQuery(req.query.includeRaw) === true

    const actor = (req as AiCallRequestWithUser).user
    const result = await listAiCallLogRecords({
      page,
      limit,
      search: getStringField(req.query.search) || undefined,
      status: getStringField(req.query.status) || undefined,
      sentiment: getStringField(req.query.sentiment) || undefined,
      successful: getBooleanQuery(req.query.successful),
      direction: getStringField(req.query.direction) || undefined,
      includeRaw,
    }, actor)

    res.status(200).json({
      success: true,
      message: 'AI call logs fetched',
      provider: 'retell',
      rawIncluded: includeRaw,
      ...result,
    })
  } catch (error) {
    next(error)
  }
}

export async function getAiCallLog(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number.parseInt(getStringField(req.params.id), 10)
    const includeRaw = getBooleanQuery(req.query.includeRaw) === true

    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({
        success: false,
        message: 'AI call log id is invalid',
        provider: 'retell',
      })
      return
    }

    const actor = (req as AiCallRequestWithUser).user
    const item = await getAiCallLogRecordById(id, includeRaw, actor)

    if (!item) {
      res.status(404).json({
        success: false,
        message: 'AI call log was not found',
        provider: 'retell',
      })
      return
    }

    res.status(200).json({
      success: true,
      message: 'AI call log fetched',
      provider: 'retell',
      rawIncluded: includeRaw,
      item,
    })
  } catch (error) {
    next(error)
  }
}

