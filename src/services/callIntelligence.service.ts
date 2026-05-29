import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { transcribeRecording } from './aiProvider.service'

const isTranscriptionEnabled = () => {
  return process.env.AI_TRANSCRIPTION_ENABLED === 'true'
}

const getMaxTranscriptionSeconds = () => {
  const minutes = Number(process.env.AI_MAX_TRANSCRIPTION_MINUTES || 15)

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 15 * 60
  }

  return minutes * 60
}

export const getCallIntelligence = async (callId: number) => {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: {
      id: true,
      recordingSid: true,
      recordingUrl: true,
      disposition: true,
      duration: true,
      startedAt: true,
      endedAt: true,
    },
  })

  if (!call) throw new AppError('Call not found', 404)

  return {
    call,
    transcript: null,
    summary: null,
    sentiment: null,
    status: 'PHASE_4_STORAGE_NOT_ENABLED',
    note: 'Apply Phase 4 Prisma migration before enabling stored transcripts/summaries.',
  }
}

export const createTranscriptionJob = async (callId: number) => {
  const call = await prisma.call.findUnique({ where: { id: callId } })

  if (!call) throw new AppError('Call not found', 404)
  if (!call.recordingUrl) throw new AppError('Call recording is not available', 400)

  if (!isTranscriptionEnabled()) {
    return {
      callId,
      status: 'DISABLED',
      transcript: null,
      note: 'AI transcription is disabled. Set AI_TRANSCRIPTION_ENABLED=true to process recordings.',
    }
  }

  const maxSeconds = getMaxTranscriptionSeconds()

  if (typeof call.duration === 'number' && call.duration > maxSeconds) {
    throw new AppError(
      `Call duration exceeds transcription limit of ${Math.round(maxSeconds / 60)} minutes.`,
      400
    )
  }

  try {
    const transcription = await transcribeRecording(call.recordingUrl)

    return {
      callId,
      status: 'COMPLETED',
      transcript: transcription.text,
      provider: transcription.provider,
      model: transcription.model,
      note: 'Transcript generated but not stored. Apply Phase 4 storage migration before persistence.',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed'
    throw new AppError(message, 503)
  }
}
