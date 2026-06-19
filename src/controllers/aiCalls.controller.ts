import { Request, Response, NextFunction } from 'express'
import {
  getAiCallLogRecordById,
  listAiCallLogRecords,
  upsertAiCallLogFromRetellWebhook,
} from '../services/aiCallLog.service'
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

    const result = await listAiCallLogRecords({
      page,
      limit,
      search: getStringField(req.query.search) || undefined,
      status: getStringField(req.query.status) || undefined,
      sentiment: getStringField(req.query.sentiment) || undefined,
      successful: getBooleanQuery(req.query.successful),
      direction: getStringField(req.query.direction) || undefined,
      includeRaw,
    })

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

    const item = await getAiCallLogRecordById(id, includeRaw)

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

