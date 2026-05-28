import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

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

  return {
    callId,
    status: 'QUEUED',
    note: 'Provider adapter and transcript storage must be enabled before processing.',
  }
}
