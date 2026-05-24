import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

export const listRecordings = async (filters: {
  from?: Date
  to?: Date
  agentId?: number
  campaignId?: number
  search?: string
  page?: number
  limit?: number
}) => {
  const page = filters.page || 1
  const limit = Math.min(filters.limit || 50, 100)

  const where: Record<string, unknown> = {
    recordingUrl: { not: null },
  }

  if (filters.agentId) where.agentId = filters.agentId
  if (filters.campaignId) where.campaignId = filters.campaignId
  if (filters.from || filters.to) {
    where.startedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  if (filters.search) {
    where.OR = [
      { remoteNumber: { contains: filters.search, mode: 'insensitive' } },
      { contact: { name: { contains: filters.search, mode: 'insensitive' } } },
      { contact: { phone: { contains: filters.search, mode: 'insensitive' } } },
    ]
  }

  const recordings = await prisma.call.findMany({
    where,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      agent: { select: { id: true, name: true, agentCode: true } },
      campaign: { select: { id: true, name: true } },
    },
    orderBy: { startedAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
  const total = await prisma.call.count({ where })

  return {
    recordings,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}

export const getRecording = async (callId: number) => {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      agent: { select: { id: true, name: true, agentCode: true } },
      campaign: { select: { id: true, name: true } },
    },
  })

  if (!call || !call.recordingUrl) throw new AppError('Recording not found', 404)
  return call
}

export const getRecordingAccess = async (callId: number) => {
  const call = await getRecording(callId)
  return {
    callId: call.id,
    recordingUrl: call.recordingUrl,
    recordingSid: call.recordingSid,
  }
}
