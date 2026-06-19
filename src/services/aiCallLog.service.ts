import { PrismaClient, Prisma } from '@prisma/client'
import { RetellPhoneCallResponse } from './retell.service'

const prisma = new PrismaClient()

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown) {
  const text = getString(value)
  return text || undefined
}

function jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined
  return value as Prisma.InputJsonValue
}

function buildCreateData(
  event: string,
  call: RetellPhoneCallResponse | Record<string, unknown>,
  rawPayload: Record<string, unknown>,
): Prisma.AiCallLogCreateInput {
  const callAnalysis = isRecord(call.call_analysis) ? call.call_analysis : undefined
  const transcript = getString(call.transcript)
  const recordingUrl = getString(call.recording_url)
  const providerCallId = getString(call.call_id)

  return {
    provider: 'retell',
    providerCallId,
    lastEvent: event,
    callStatus: optionalString(call.call_status),
    callType: optionalString(call.call_type),
    direction: optionalString(call.direction),
    fromNumber: optionalString(call.from_number),
    toNumber: optionalString(call.to_number),
    agentId: optionalString(call.agent_id),
    agentName: optionalString(call.agent_name),
    durationMs: getNumber(call.duration_ms),
    disconnectionReason: optionalString(call.disconnection_reason),
    transferDestination: optionalString(call.transfer_destination),
    transcriptText: transcript || undefined,
    transcriptLength: transcript.length,
    recordingUrl: recordingUrl || undefined,
    hasRecordingUrl: recordingUrl.length > 0,
    callSummary: optionalString(callAnalysis?.call_summary),
    userSentiment: optionalString(callAnalysis?.user_sentiment),
    callSuccessful: getBoolean(callAnalysis?.call_successful),
    inVoicemail: getBoolean(callAnalysis?.in_voicemail),
    callAnalysis: jsonOrUndefined(callAnalysis),
    rawPayload: jsonOrUndefined(rawPayload),
    lastWebhookAt: new Date(),
  }
}

function setStringIfPresent(
  target: Prisma.AiCallLogUpdateInput,
  key: keyof Prisma.AiCallLogUpdateInput,
  value: unknown,
) {
  const text = getString(value)

  if (text) {
    ;(target as Record<string, unknown>)[key as string] = text
  }
}

function buildUpdateData(
  event: string,
  call: RetellPhoneCallResponse | Record<string, unknown>,
  rawPayload: Record<string, unknown>,
): Prisma.AiCallLogUpdateInput {
  const callAnalysis = isRecord(call.call_analysis) ? call.call_analysis : undefined
  const transcript = getString(call.transcript)
  const recordingUrl = getString(call.recording_url)
  const durationMs = getNumber(call.duration_ms)

  const updateData: Prisma.AiCallLogUpdateInput = {
    lastEvent: event,
    rawPayload: jsonOrUndefined(rawPayload),
    lastWebhookAt: new Date(),
  }

  setStringIfPresent(updateData, 'callStatus', call.call_status)
  setStringIfPresent(updateData, 'callType', call.call_type)
  setStringIfPresent(updateData, 'direction', call.direction)
  setStringIfPresent(updateData, 'fromNumber', call.from_number)
  setStringIfPresent(updateData, 'toNumber', call.to_number)
  setStringIfPresent(updateData, 'agentId', call.agent_id)
  setStringIfPresent(updateData, 'agentName', call.agent_name)
  setStringIfPresent(updateData, 'disconnectionReason', call.disconnection_reason)
  setStringIfPresent(updateData, 'transferDestination', call.transfer_destination)

  if (durationMs !== undefined) {
    updateData.durationMs = durationMs
  }

  if (transcript) {
    updateData.transcriptText = transcript
    updateData.transcriptLength = transcript.length
  }

  if (recordingUrl) {
    updateData.recordingUrl = recordingUrl
    updateData.hasRecordingUrl = true
  }

  if (callAnalysis) {
    updateData.callAnalysis = jsonOrUndefined(callAnalysis)

    setStringIfPresent(updateData, 'callSummary', callAnalysis.call_summary)
    setStringIfPresent(updateData, 'userSentiment', callAnalysis.user_sentiment)

    const callSuccessful = getBoolean(callAnalysis.call_successful)
    const inVoicemail = getBoolean(callAnalysis.in_voicemail)

    if (callSuccessful !== undefined) {
      updateData.callSuccessful = callSuccessful
    }

    if (inVoicemail !== undefined) {
      updateData.inVoicemail = inVoicemail
    }
  }

  return updateData
}

export async function upsertAiCallLogFromRetellWebhook(input: {
  event: string
  call: RetellPhoneCallResponse | Record<string, unknown>
  rawPayload: Record<string, unknown>
}) {
  const providerCallId = getString(input.call.call_id)

  if (!providerCallId) {
    return null
  }

  const createData = buildCreateData(input.event, input.call, input.rawPayload)
  const updateData = buildUpdateData(input.event, input.call, input.rawPayload)

  return prisma.aiCallLog.upsert({
    where: {
      providerCallId,
    },
    create: createData,
    update: updateData,
    select: {
      id: true,
      providerCallId: true,
      lastEvent: true,
      callStatus: true,
      durationMs: true,
      transcriptLength: true,
      hasRecordingUrl: true,
      callSuccessful: true,
      updatedAt: true,
    },
  })
}

function maskPhoneForAudit(phoneNumber?: string) {
  if (!phoneNumber) return null
  return phoneNumber.replace(/^(\+\d{2})(\d+)(\d{3})$/, (_match, prefix, middle, suffix) => {
    return `${prefix}${'*'.repeat(String(middle).length)}${suffix}`
  })
}

export async function createAiCallLogFromOutboundRequest(input: {
  call: RetellPhoneCallResponse | Record<string, unknown>
  request: {
    actorId?: number
    toNumber: string
    fromNumber: string
    transferDestination: string
    assistantId?: string
    source?: string
  }
}) {
  const providerCallId = getString(input.call.call_id)

  if (!providerCallId) {
    return null
  }

  const requestMetadata = {
    source: input.request.source || 'ptdt-dialer',
    requestedBy: input.request.actorId ?? null,
    assistantId: input.request.assistantId || 'default',
    toNumberMasked: maskPhoneForAudit(input.request.toNumber),
    fromNumberMasked: maskPhoneForAudit(input.request.fromNumber),
    transferDestinationMasked: maskPhoneForAudit(input.request.transferDestination),
  }

  const callWithRequestData: Record<string, unknown> = {
    ...input.call,
    call_id: providerCallId,
    call_type: getString(input.call.call_type) || 'phone_call',
    direction: getString(input.call.direction) || 'outbound',
    from_number: getString(input.call.from_number) || input.request.fromNumber,
    to_number: getString(input.call.to_number) || input.request.toNumber,
    transfer_destination: getString(input.call.transfer_destination) || input.request.transferDestination,
  }

  const rawPayload = {
    outboundRequest: requestMetadata,
  }

  const createData = buildCreateData('outbound_started', callWithRequestData, rawPayload)
  const updateData = buildUpdateData('outbound_started', callWithRequestData, rawPayload)

  createData.transferDestination = input.request.transferDestination
  updateData.transferDestination = input.request.transferDestination

  const record = await prisma.aiCallLog.upsert({
    where: {
      providerCallId,
    },
    create: createData,
    update: updateData,
    select: {
      id: true,
      providerCallId: true,
      lastEvent: true,
      callStatus: true,
      direction: true,
      toNumber: true,
      transferDestination: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.request.actorId ?? null,
        action: 'AI_CALL_STARTED',
        entity: 'AI_CALL',
        entityId: String(record.id),
        metadata: requestMetadata as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    console.warn('[ai-call-outbound] Audit log write failed', {
      aiCallLogId: record.id,
      error: error instanceof Error ? error.message : 'Unknown audit error',
    })
  }

  return record
}

export interface AiCallLogListInput {
  page: number
  limit: number
  search?: string
  status?: string
  sentiment?: string
  successful?: boolean
  direction?: string
  includeRaw?: boolean
}

function buildAiCallLogWhere(input: AiCallLogListInput): Prisma.AiCallLogWhereInput {
  const where: Prisma.AiCallLogWhereInput = {}

  if (input.status) {
    where.callStatus = input.status
  }

  if (input.sentiment) {
    where.userSentiment = input.sentiment
  }

  if (input.successful !== undefined) {
    where.callSuccessful = input.successful
  }

  if (input.direction) {
    where.direction = input.direction
  }

  if (input.search) {
    where.OR = [
      { providerCallId: { contains: input.search, mode: 'insensitive' } },
      { fromNumber: { contains: input.search, mode: 'insensitive' } },
      { toNumber: { contains: input.search, mode: 'insensitive' } },
      { agentName: { contains: input.search, mode: 'insensitive' } },
      { callSummary: { contains: input.search, mode: 'insensitive' } },
    ]
  }

  return where
}

const listSelect = {
  id: true,
  provider: true,
  providerCallId: true,
  lastEvent: true,
  callStatus: true,
  callType: true,
  direction: true,
  fromNumber: true,
  toNumber: true,
  agentName: true,
  durationMs: true,
  disconnectionReason: true,
  transcriptLength: true,
  hasRecordingUrl: true,
  callSummary: true,
  userSentiment: true,
  callSuccessful: true,
  inVoicemail: true,
  lastWebhookAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiCallLogSelect

const detailSelect = {
  ...listSelect,
  agentId: true,
  transferDestination: true,
  transcriptText: true,
  recordingUrl: true,
  callAnalysis: true,
} satisfies Prisma.AiCallLogSelect

export async function listAiCallLogRecords(input: AiCallLogListInput) {
  const page = Math.max(1, input.page)
  const limit = Math.min(Math.max(1, input.limit), 100)
  const skip = (page - 1) * limit
  const where = buildAiCallLogWhere(input)

  const [items, total] = await Promise.all([
    prisma.aiCallLog.findMany({
      where,
      select: input.includeRaw ? { ...listSelect, rawPayload: true } : listSelect,
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    }),
    prisma.aiCallLog.count({ where }),
  ])

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  }
}

export async function getAiCallLogRecordById(id: number, includeRaw = false) {
  return prisma.aiCallLog.findUnique({
    where: {
      id,
    },
    select: includeRaw ? { ...detailSelect, rawPayload: true } : detailSelect,
  })
}
