import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import * as Scope from './commercialScope.service'

type Actor = Scope.ScopeActor

export type CallbackStatus = 'PENDING' | 'COMPLETED' | 'RESCHEDULED' | 'CANCELLED'

const commercialAccountSelect = {
  id: true,
  name: true,
  code: true,
  status: true,
} as const

const callbackInclude = {
  contact: {
    select: {
      id: true,
      name: true,
      phone: true,
      campaign: {
        select: {
          id: true,
          name: true,
          commercialAccount: { select: commercialAccountSelect },
        },
      },
    },
  },
  call: {
    select: {
      id: true,
      status: true,
      disposition: true,
      campaign: {
        select: {
          id: true,
          name: true,
          commercialAccount: { select: commercialAccountSelect },
        },
      },
    },
  },
  agent: {
    select: {
      id: true,
      name: true,
      agentCode: true,
      commercialMemberships: {
        where: { status: 'ACTIVE' },
        select: { account: { select: commercialAccountSelect } },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
} as const

const cleanAccounts = (accounts: Array<{ id: number; name: string; code: string; status: string } | null | undefined>) => {
  const seen = new Set<number>()
  return accounts.filter((account): account is { id: number; name: string; code: string; status: string } => {
    if (!account || seen.has(account.id)) return false
    seen.add(account.id)
    return true
  })
}

const shapeCallback = (callback: any) => {
  const agentAccounts = callback.agent?.commercialMemberships?.map((item: any) => item.account) || []
  const commercialAccounts = cleanAccounts([
    callback.call?.campaign?.commercialAccount,
    callback.contact?.campaign?.commercialAccount,
    ...agentAccounts,
  ])

  const agent = callback.agent
    ? {
        id: callback.agent.id,
        name: callback.agent.name,
        agentCode: callback.agent.agentCode,
      }
    : null

  return {
    ...callback,
    agent,
    commercialAccounts,
    commercialAccount: commercialAccounts[0] || null,
  }
}

export const createCallback = async (data: {
  contactId?: number | null
  callId?: number | null
  agentId: number
  scheduledAt: string
  notes?: string | null
}, actor?: Actor) => {
  if (data.contactId) await Scope.assertContactAccess(data.contactId, actor)
  if (data.callId) await Scope.assertCallAccess(data.callId, actor)
  const scheduledAt = new Date(data.scheduledAt)
  if (isNaN(scheduledAt.getTime())) throw new AppError('Invalid scheduledAt date', 400)

  const callback = await prisma.callback.create({
    data: {
      contactId:   data.contactId  ?? null,
      callId:      data.callId     ?? null,
      agentId:     data.agentId,
      scheduledAt,
      notes:       data.notes ?? null,
      status:      'PENDING',
    },
    include: callbackInclude,
  })

  return shapeCallback(callback)
}

export const getAllCallbacks = async (filters: {
  status?: CallbackStatus
  from?: string
  to?: string
  agentId?: number
  page?: number
  limit?: number
}, actor?: Actor) => {
  const { status, from, to, agentId, page = 1, limit = 30 } = filters

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (agentId) where.agentId = agentId
  if (!Scope.isPlatformActor(actor)) {
    const accountIds = await Scope.getActorAccountIds(actor)
    where.OR = [
      { agent: { commercialMemberships: { some: { accountId: { in: accountIds.length ? accountIds : [-1] }, status: 'ACTIVE' } } } },
      { call: { campaign: { commercialAccountId: { in: accountIds.length ? accountIds : [-1] } } } },
      { contact: { campaign: { commercialAccountId: { in: accountIds.length ? accountIds : [-1] } } } },
    ]
  }
  if (from || to) {
    where.scheduledAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    }
  }

  const callbacks = await prisma.callback.findMany({
    where,
    include: callbackInclude,
    orderBy: { scheduledAt: 'desc' },
    skip:  (page - 1) * limit,
    take:  limit,
  })
  const total = await prisma.callback.count({ where })

  return {
    callbacks: callbacks.map(shapeCallback),
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
  requestingUserId: number,
  actor?: Actor
) => {
  const existing = await prisma.callback.findUnique({ where: { id } })
  if (!existing) throw new AppError('Callback not found', 404)
  if (existing.callId) await Scope.assertCallAccess(existing.callId, actor)
  else if (existing.contactId) await Scope.assertContactAccess(existing.contactId, actor)
  else if (!Scope.isPlatformActor(actor) && existing.agentId !== actor?.id) throw new AppError('Callback not found for this commercial account', 404)

  const updateData: Record<string, unknown> = {}
  if (data.status) updateData.status = data.status
  if (data.notes !== undefined) updateData.notes = data.notes
  if (data.scheduledAt) {
    const d = new Date(data.scheduledAt)
    if (isNaN(d.getTime())) throw new AppError('Invalid scheduledAt date', 400)
    updateData.scheduledAt = d
  }

  const callback = await prisma.callback.update({
    where: { id },
    data: updateData,
    include: callbackInclude,
  })

  return shapeCallback(callback)
}
