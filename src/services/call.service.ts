import type { CallDisposition, CallStatus, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

type CallAccessUser = {
  id: number
  role: string
}

export type ListCallsFilters = {
  campaignId?: number
  agentId?: number
  status?: CallStatus
  page?: number
  limit?: number
  startDate?: Date
  endDate?: Date
}

const clampPagination = (page = 1, limit = 20) => ({
  page: Number.isFinite(page) && page > 0 ? page : 1,
  limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 20,
})

const ensureCanAccessCall = (
  call: { agentId: number | null },
  user: CallAccessUser | undefined,
  action: 'view' | 'update'
) => {
  if (!user) throw new AppError('Unauthorized', 401)

  if (user.role === 'ADMIN' || user.role === 'SUPERVISOR') return

  if (user.role === 'AGENT' && call.agentId === user.id) return

  throw new AppError(
    action === 'view'
      ? 'You are not allowed to view this call'
      : 'You are not allowed to update this call',
    403
  )
}

export const listCalls = async (
  filters: ListCallsFilters,
  user?: CallAccessUser
) => {
  const {
    campaignId,
    agentId,
    status,
    startDate,
    endDate,
  } = filters
  const { page, limit } = clampPagination(filters.page, filters.limit)

  const where: Prisma.CallWhereInput = {}

  if (campaignId !== undefined) where.campaignId = campaignId
  if (agentId !== undefined) where.agentId = agentId
  if (status) where.status = status
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    }
  }

  if (user?.role === 'AGENT') {
    where.agentId = user.id
  }

  const [calls, total] = await Promise.all([
    prisma.call.findMany({
      where,
      include: {
        contact: true,
        agent: { select: { id: true, name: true, agentCode: true } },
        campaign: { select: { id: true, name: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.call.count({ where }),
  ])

  return {
    calls,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export const getCallById = async (id: number, user?: CallAccessUser) => {
  const call = await prisma.call.findUnique({
    where: { id },
    include: {
      contact: true,
      agent: { select: { id: true, name: true, agentCode: true } },
      campaign: { select: { id: true, name: true } },
    },
  })

  if (!call) throw new AppError('Call not found', 404)
  ensureCanAccessCall(call, user, 'view')

  return call
}

export const updateCallDisposition = async (
  id: number,
  disposition: CallDisposition,
  notes?: string,
  user?: CallAccessUser
) => {
  const existing = await prisma.call.findUnique({
    where: { id },
    select: { id: true, contactId: true, agentId: true },
  })

  if (!existing) throw new AppError('Call not found', 404)
  ensureCanAccessCall(existing, user, 'update')

  const call = await prisma.call.update({
    where: { id },
    data: {
      disposition,
      status: 'COMPLETED',
      endedAt: new Date(),
    },
    include: {
      contact: true,
      agent: { select: { id: true, name: true, agentCode: true } },
      campaign: { select: { id: true, name: true } },
    },
  })

  await prisma.contact.update({
    where: { id: existing.contactId },
    data: {
      status: disposition === 'DO_NOT_CALL' ? 'DNC' : 'DONE',
      ...(notes !== undefined ? { notes } : {}),
    },
  })

  return call
}
