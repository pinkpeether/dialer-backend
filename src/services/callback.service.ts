import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import type { CallbackStatus } from '@prisma/client'

export const createCallback = async (data: {
  contactId?: number | null
  callId?: number | null
  agentId: number
  scheduledAt: string
  notes?: string | null
}) => {
  const scheduledAt = new Date(data.scheduledAt)
  if (isNaN(scheduledAt.getTime())) throw new AppError('Invalid scheduledAt date', 400)

  return await prisma.callback.create({
    data: {
      contactId:   data.contactId  ?? null,
      callId:      data.callId     ?? null,
      agentId:     data.agentId,
      scheduledAt,
      notes:       data.notes ?? null,
      status:      'PENDING',
    },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      call:    { select: { id: true, status: true, disposition: true } },
      agent:   { select: { id: true, name: true, agentCode: true } },
    },
  })
}

export const getAllCallbacks = async (filters: {
  status?: CallbackStatus
  from?: string
  to?: string
  agentId?: number
  page?: number
  limit?: number
}) => {
  const { status, from, to, agentId, page = 1, limit = 30 } = filters

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (agentId) where.agentId = agentId
  if (from || to) {
    where.scheduledAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    }
  }

  const [callbacks, total] = await Promise.all([
    prisma.callback.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        call:    { select: { id: true, status: true, disposition: true } },
        agent:   { select: { id: true, name: true, agentCode: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.callback.count({ where }),
  ])

  return {
    callbacks,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export const updateCallback = async (
  id: number,
  data: {
    status?: CallbackStatus
    scheduledAt?: string
    notes?: string | null
  },
  requestingUserId: number
) => {
  const existing = await prisma.callback.findUnique({ where: { id } })
  if (!existing) throw new AppError('Callback not found', 404)

  const updateData: Record<string, unknown> = {}
  if (data.status) updateData.status = data.status
  if (data.notes !== undefined) updateData.notes = data.notes
  if (data.scheduledAt) {
    const d = new Date(data.scheduledAt)
    if (isNaN(d.getTime())) throw new AppError('Invalid scheduledAt date', 400)
    updateData.scheduledAt = d
  }

  return await prisma.callback.update({
    where: { id },
    data: updateData,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      agent:   { select: { id: true, name: true, agentCode: true } },
    },
  })
}
