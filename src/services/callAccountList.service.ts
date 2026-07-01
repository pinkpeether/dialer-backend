import type { CallStatus, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import * as Scope from './commercialScope.service'

type Actor = { id: number; email?: string; role?: string }

type ListCallsFilters = {
  campaignId?: number
  agentId?: number
  status?: CallStatus
  direction?: string
  page?: number
  limit?: number
  startDate?: Date
  endDate?: Date
}

const clampPagination = (page = 1, limit = 20) => ({
  page: Number.isFinite(page) && page > 0 ? page : 1,
  limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 20,
})

const normalizeDirection = (value?: string) => {
  const direction = value?.trim().toLowerCase()
  return direction === 'incoming' || direction === 'inbound' ? 'incoming' : 'outgoing'
}

const commercialAccountSelect = {
  id: true,
  name: true,
  code: true,
  status: true,
} as const

const campaignSelect = {
  id: true,
  name: true,
  commercialAccount: { select: commercialAccountSelect },
} as const

export const listCallsWithAccounts = async (filters: ListCallsFilters, user?: Actor) => {
  const { campaignId, agentId, status, direction, startDate, endDate } = filters
  const { page, limit } = clampPagination(filters.page, filters.limit)
  const where: Prisma.CallWhereInput = await Scope.callScopeWhere(user)

  if (campaignId !== undefined) where.campaignId = campaignId
  if (agentId !== undefined) where.agentId = agentId
  if (status) where.status = status
  if (direction) where.direction = normalizeDirection(direction)
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    }
  }
  if (user?.role === 'AGENT') where.agentId = user.id

  const calls = await prisma.call.findMany({
    where,
    include: {
      contact: true,
      agent: { select: { id: true, name: true, agentCode: true } },
      campaign: { select: campaignSelect },
    },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  })
  const total = await prisma.call.count({ where })

  return {
    calls: calls.map(call => ({
      ...call,
      commercialAccount: call.campaign?.commercialAccount || null,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}
