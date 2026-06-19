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
