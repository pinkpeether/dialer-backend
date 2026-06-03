import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { analyzeTranscriptInsight, transcribeRecording } from './aiProvider.service'
import { refreshSignedRecordingUrlFromStoredUrl } from './recordingStorage.service'

const truthyValues = new Set(['true', '1', 'yes', 'on'])
const falseyValues = new Set(['false', '0', 'no', 'off'])

const isTruthyEnv = (value?: string) => {
  return truthyValues.has(String(value || '').trim().toLowerCase())
}

const isFalseyEnv = (value?: string) => {
  return falseyValues.has(String(value || '').trim().toLowerCase())
}

const isTranscriptionEnabled = () => {
  return isTruthyEnv(process.env.AI_TRANSCRIPTION_ENABLED)
}

const isInsightEnabled = () => {
  const value = process.env.AI_INSIGHTS_ENABLED ?? process.env.AI_INSIGHT_ENABLED

  if (typeof value === 'undefined') {
    return true
  }

  return !isFalseyEnv(value)
}

const getMaxTranscriptionSeconds = () => {
  const minutes = Number(process.env.AI_MAX_TRANSCRIPTION_MINUTES || 15)

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 15 * 60
  }

  return minutes * 60
}

const getPositiveIntegerEnv = (keys: string[], fallback: number) => {
  for (const key of keys) {
    const raw = process.env[key]

    if (typeof raw === 'undefined' || raw === '') {
      continue
    }

    const value = Number(raw)

    if (Number.isFinite(value) && value > 0) {
      return Math.floor(value)
    }
  }

  return fallback
}

const getDailyTranscriptLimit = () => {
  return getPositiveIntegerEnv(
    ['AI_MAX_TRANSCRIPTS_PER_DAY', 'AI_DAILY_TRANSCRIPTION_LIMIT'],
    25
  )
}

const getDailyInsightLimit = () => {
  return getPositiveIntegerEnv(
    ['AI_MAX_INSIGHTS_PER_DAY', 'AI_DAILY_INSIGHT_LIMIT'],
    50
  )
}

const getUtcDayStart = () => {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  return start
}

const assertDailyTranscriptLimitAvailable = async () => {
  const limit = getDailyTranscriptLimit()
  const generatedToday = await prisma.callTranscript.count({
    where: {
      deletedAt: null,
      status: 'COMPLETED',
      generatedAt: {
        gte: getUtcDayStart(),
      },
    },
  })

  if (generatedToday >= limit) {
    throw new AppError(
      `Daily AI transcription limit reached (${generatedToday}/${limit}). Increase AI_MAX_TRANSCRIPTS_PER_DAY or try again tomorrow.`,
      429
    )
  }
}

const assertDailyInsightLimitAvailable = async () => {
  const limit = getDailyInsightLimit()
  const generatedToday = await prisma.callInsight.count({
    where: {
      deletedAt: null,
      status: 'COMPLETED',
      generatedAt: {
        gte: getUtcDayStart(),
      },
    },
  })

  if (generatedToday >= limit) {
    throw new AppError(
      `Daily AI insight limit reached (${generatedToday}/${limit}). Increase AI_MAX_INSIGHTS_PER_DAY or try again tomorrow.`,
      429
    )
  }
}

type StoredTranscript = {
  id: number
  callId: number
  transcriptText: string
  provider: string
  model: string
  language: string | null
  durationSeconds: number | null
  status: string
  errorMessage: string | null
  generatedAt: Date
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type StoredInsight = {
  id: number
  callId: number
  summary: string | null
  sentiment: string | null
  score: number | null
  intent: string | null
  objections: unknown
  actionItems: unknown
  provider: string | null
  model: string | null
  status: string
  generatedAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const transcriptSelect = {
  id: true,
  callId: true,
  transcriptText: true,
  provider: true,
  model: true,
  language: true,
  durationSeconds: true,
  status: true,
  errorMessage: true,
  generatedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

const insightSelect = {
  id: true,
  callId: true,
  summary: true,
  sentiment: true,
  score: true,
  intent: true,
  objections: true,
  actionItems: true,
  provider: true,
  model: true,
  status: true,
  generatedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

const callSelect = {
  id: true,
  recordingSid: true,
  recordingUrl: true,
  disposition: true,
  duration: true,
  startedAt: true,
  endedAt: true,
  transcript: {
    select: transcriptSelect,
  },
  insight: {
    select: insightSelect,
  },
} as const

const serializeTranscript = (transcript?: StoredTranscript | null) => {
  if (!transcript || transcript.deletedAt) return null

  return {
    id: transcript.id,
    callId: transcript.callId,
    transcript: transcript.transcriptText,
    transcriptText: transcript.transcriptText,
    provider: transcript.provider,
    model: transcript.model,
    language: transcript.language,
    durationSeconds: transcript.durationSeconds,
    status: transcript.status,
    errorMessage: transcript.errorMessage,
    generatedAt: transcript.generatedAt,
    createdAt: transcript.createdAt,
    updatedAt: transcript.updatedAt,
  }
}

const serializeInsight = (insight?: StoredInsight | null) => {
  if (!insight || insight.deletedAt) return null

  return {
    id: insight.id,
    callId: insight.callId,
    summary: insight.summary,
    sentiment: insight.sentiment,
    score: insight.score,
    intent: insight.intent,
    objections: insight.objections,
    actionItems: insight.actionItems,
    provider: insight.provider,
    model: insight.model,
    status: insight.status,
    generatedAt: insight.generatedAt,
    createdAt: insight.createdAt,
    updatedAt: insight.updatedAt,
  }
}

const buildCallIntelligenceResponse = ({
  call,
  status,
  note,
}: {
  call: {
    id: number
    recordingSid: string | null
    recordingUrl: string | null
    disposition: unknown
    duration: number | null
    startedAt: Date
    endedAt: Date | null
    transcript?: StoredTranscript | null
    insight?: StoredInsight | null
  }
  status: string
  note: string
}) => {
  const transcript = serializeTranscript(call.transcript)
  const insight = serializeInsight(call.insight)

  return {
    call: {
      id: call.id,
      recordingSid: call.recordingSid,
      recordingUrl: call.recordingUrl,
      disposition: call.disposition,
      duration: call.duration,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
    },
    transcript: transcript?.transcript ?? null,
    transcriptText: transcript?.transcriptText ?? null,
    transcriptRecord: transcript,
    summary: insight?.summary ?? null,
    sentiment: insight?.sentiment ?? null,
    insight,
    aiControls: {
      transcriptionEnabled: isTranscriptionEnabled(),
      insightsEnabled: isInsightEnabled(),
      maxTranscriptionMinutes: Math.round(getMaxTranscriptionSeconds() / 60),
      maxTranscriptsPerDay: getDailyTranscriptLimit(),
      maxInsightsPerDay: getDailyInsightLimit(),
    },
    status,
    note,
  }
}

export const getCallIntelligence = async (callId: number) => {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: callSelect,
  })

  if (!call) throw new AppError('Call not found', 404)

  if (call.transcript && !call.transcript.deletedAt && call.insight && !call.insight.deletedAt) {
    return buildCallIntelligenceResponse({
      call,
      status: 'INSIGHT_STORED',
      note: 'Stored transcript and call insight are available for this call.',
    })
  }

  if (call.transcript && !call.transcript.deletedAt) {
    if (!isInsightEnabled()) {
      return buildCallIntelligenceResponse({
        call,
        status: 'INSIGHT_DISABLED',
        note: 'Stored transcript is available, but AI insight generation is disabled. Set AI_INSIGHTS_ENABLED=true to enable summaries, sentiment, and scoring.',
      })
    }

    return buildCallIntelligenceResponse({
      call,
      status: 'TRANSCRIPT_STORED',
      note: 'Stored transcript is available for this call. Use Generate Insight to create summary, sentiment, and scoring.',
    })
  }

  if (!call.recordingUrl) {
    return buildCallIntelligenceResponse({
      call,
      status: 'RECORDING_NOT_AVAILABLE',
      note: 'This call does not have an attached recording yet. Ingest or enable call recordings before running AI transcription.',
    })
  }

  if (!isTranscriptionEnabled()) {
    return buildCallIntelligenceResponse({
      call,
      status: 'TRANSCRIPTION_DISABLED',
      note: 'Recording is available, but AI transcription is disabled. Set AI_TRANSCRIPTION_ENABLED=true to process recordings.',
    })
  }

  return buildCallIntelligenceResponse({
    call,
    status: 'READY_FOR_TRANSCRIPTION',
    note: 'Recording is available. Use Queue Transcript to generate and store transcript output.',
  })
}

export const createTranscriptionJob = async (callId: number) => {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: callSelect,
  })

  if (!call) throw new AppError('Call not found', 404)
  if (!call.recordingUrl) throw new AppError('Call recording is not available', 400)

  if (call.transcript && !call.transcript.deletedAt) {
    return buildCallIntelligenceResponse({
      call,
      status: 'TRANSCRIPT_STORED',
      note: 'Transcript already exists for this call. Returning stored transcript without creating a duplicate.',
    })
  }

  if (!isTranscriptionEnabled()) {
    return buildCallIntelligenceResponse({
      call,
      status: 'DISABLED',
      note: 'AI transcription is disabled. Set AI_TRANSCRIPTION_ENABLED=true to process recordings.',
    })
  }

  const maxSeconds = getMaxTranscriptionSeconds()

  if (typeof call.duration === 'number' && call.duration > maxSeconds) {
    throw new AppError(
      `Call duration exceeds transcription limit of ${Math.round(maxSeconds / 60)} minutes.`,
      400
    )
  }

  await assertDailyTranscriptLimitAvailable()

  try {
    const refreshedRecording = await refreshSignedRecordingUrlFromStoredUrl(call.recordingUrl)
    const transcription = await transcribeRecording(refreshedRecording.signedUrl)

    await prisma.call.update({
      where: { id: callId },
      data: { recordingUrl: refreshedRecording.signedUrl },
    })

    const transcriptProvider = transcription.provider || process.env.AI_PROVIDER || 'unknown'
    const transcriptModel = transcription.model || process.env.AI_TRANSCRIPTION_MODEL || 'unknown'

    await prisma.callTranscript.upsert({
      where: { callId },
      create: {
        callId,
        transcriptText: transcription.text,
        provider: transcriptProvider,
        model: transcriptModel,
        status: 'COMPLETED',
        durationSeconds: call.duration,
        generatedAt: new Date(),
      },
      update: {
        transcriptText: transcription.text,
        provider: transcriptProvider,
        model: transcriptModel,
        status: 'COMPLETED',
        errorMessage: null,
        durationSeconds: call.duration,
        deletedAt: null,
        generatedAt: new Date(),
      },
    })

    const updatedCall = await prisma.call.findUnique({
      where: { id: callId },
      select: callSelect,
    })

    if (!updatedCall) throw new AppError('Call not found after transcript save', 404)

    return buildCallIntelligenceResponse({
      call: updatedCall,
      status: 'COMPLETED',
      note: 'Transcript generated and stored successfully.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed'
    throw new AppError(message, 503)
  }
}

export const createCallInsight = async (callId: number) => {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: callSelect,
  })

  if (!call) throw new AppError('Call not found', 404)

  if (!call.transcript || call.transcript.deletedAt) {
    throw new AppError('Stored transcript is required before generating call insight.', 400)
  }

  if (call.insight && !call.insight.deletedAt) {
    return buildCallIntelligenceResponse({
      call,
      status: 'INSIGHT_STORED',
      note: 'Call insight already exists for this call. Returning stored insight without creating a duplicate.',
    })
  }

  if (!isInsightEnabled()) {
    return buildCallIntelligenceResponse({
      call,
      status: 'INSIGHT_DISABLED',
      note: 'AI insight generation is disabled. Set AI_INSIGHTS_ENABLED=true to enable summaries, sentiment, and scoring.',
    })
  }

  await assertDailyInsightLimitAvailable()

  try {
    const insight = await analyzeTranscriptInsight(call.transcript.transcriptText)

    await prisma.callInsight.upsert({
      where: { callId },
      create: {
        callId,
        summary: insight.summary,
        sentiment: insight.sentiment,
        score: insight.score,
        intent: insight.intent,
        objections: insight.objections,
        actionItems: insight.actionItems,
        provider: insight.provider,
        model: insight.model,
        status: 'COMPLETED',
        generatedAt: new Date(),
      },
      update: {
        summary: insight.summary,
        sentiment: insight.sentiment,
        score: insight.score,
        intent: insight.intent,
        objections: insight.objections,
        actionItems: insight.actionItems,
        provider: insight.provider,
        model: insight.model,
        status: 'COMPLETED',
        deletedAt: null,
        generatedAt: new Date(),
      },
    })

    const updatedCall = await prisma.call.findUnique({
      where: { id: callId },
      select: callSelect,
    })

    if (!updatedCall) throw new AppError('Call not found after insight save', 404)

    return buildCallIntelligenceResponse({
      call: updatedCall,
      status: 'INSIGHT_COMPLETED',
      note: 'Call insight generated and stored successfully.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Call insight generation failed'
    throw new AppError(message, 503)
  }
}