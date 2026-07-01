import type { CampaignStatus, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'
import { AUDIT_ACTIONS } from '../constants/auditActions'
import * as Scope from './commercialScope.service'

type AuditActor = { id: number; email?: string; role?: string }

type CampaignContactStats = {
  pending: number
  answered: number
  missed: number
  active: number
  total: number
  answerRate: number
}

const ALLOWED_MODES = ['MANUAL', 'PREVIEW', 'PROGRESSIVE', 'PREDICTIVE'] as const

const emptyCampaignStats = (): CampaignContactStats => ({
  pending: 0,
  answered: 0,
  missed: 0,
  active: 0,
  total: 0,
  answerRate: 0,
})

const toCampaignStats = (counts: Record<string, number>): CampaignContactStats => {
  const pending = counts.PENDING ?? 0
  const answered = (counts.ANSWERED ?? 0) + (counts.CONTACTED ?? 0) + (counts.DONE ?? 0)
  const missed = (counts.NO_ANSWER ?? 0) + (counts.BUSY ?? 0) + (counts.VOICEMAIL ?? 0)
  const active = (counts.CALLING ?? 0) + (counts.IN_QUEUE ?? 0)
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const dialed = Math.max(0, total - pending)

  return {
    pending,
    answered,
    missed,
    active,
    total,
    answerRate: dialed > 0 ? Math.round((answered / dialed) * 100) : 0,
  }
}

const normalizeMode = (mode?: string | null) => {
  const normalized = String(mode || 'PROGRESSIVE').toUpperCase()
  return ALLOWED_MODES.includes(normalized as typeof ALLOWED_MODES[number])
    ? normalized
    : 'PROGRESSIVE'
}

const normalizeNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.floor(numeric)))
}

const commercialAccountSelect = {
  id: true,
  name: true,
  code: true,
  status: true,
} as const

export const getAllCampaigns = async (filters: {
  status?: string
  search?: string
  page?: number
  limit?: number
}, actor?: AuditActor) => {
  const { status, search, page = 1, limit = 20 } = filters
  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100))

  const where: Prisma.CampaignWhereInput = await Scope.campaignScopeWhere(actor)
  if (status) where.status = status as CampaignStatus
  if (search) {
    where.OR = [
      { name:        { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }

  // Keep these sequential. Supabase/Railway setups often use a tiny Prisma pool,
  // and parallel campaign list/stat requests were causing connection-pool timeouts.
  const campaigns = await prisma.campaign.findMany({
    where,
    include: {
      commercialAccount: { select: commercialAccountSelect },
      _count: {
        select: {
          contacts: true,
          calls: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip:  (safePage - 1) * safeLimit,
    take:  safeLimit,
  })

  const total = await prisma.campaign.count({ where })

  const campaignIds = campaigns.map(c => c.id)
  const grouped = campaignIds.length > 0
    ? await prisma.contact.groupBy({
        by: ['campaignId', 'status'],
        where: { campaignId: { in: campaignIds } },
        _count: { _all: true },
      })
    : []

  const statsByCampaign = grouped.reduce<Record<number, Record<string, number>>>((acc, row) => {
    if (row.campaignId === null) return acc
    acc[row.campaignId] ??= {}
    acc[row.campaignId][row.status] = row._count._all
    return acc
  }, {})

  const enriched = campaigns.map(c => ({
    ...c,
    totalContacts: c._count.contacts,
    totalCalls: c._count.calls,
    stats: toCampaignStats(statsByCampaign[c.id] ?? {}),
  }))

  return {
    campaigns: enriched,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    }
  }
}

export const getCampaignById = async (id: number, actor?: AuditActor) => {
  if (!Number.isFinite(id)) throw new AppError('Invalid campaign id', 400)

  const campaign = await prisma.campaign.findFirst({
    where: { id, ...(await Scope.campaignScopeWhere(actor)) },
    include: {
      commercialAccount: { select: commercialAccountSelect },
      _count: { select: { contacts: true, calls: true } }
    }
  })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const grouped = await prisma.contact.groupBy({
    by: ['status'],
    where: { campaignId: id },
    _count: { _all: true },
  })

  const counts = grouped.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all
    return acc
  }, {})

  return {
    ...campaign,
    totalContacts: campaign._count.contacts,
    totalCalls: campaign._count.calls,
    stats: grouped.length > 0 ? toCampaignStats(counts) : emptyCampaignStats()
  }
}

export const createCampaign = async (data: {
  name: string
  description?: string
  mode?: string
  callerId?: string
  dialRatio?: number
  dialingRatio?: number
  maxRetries?: number
  retryDelay?: number
  script?: string
  startTime?: string
  endTime?: string
  timezone?: string
}, actor?: AuditActor) => {
  if (!data.name || !String(data.name).trim()) {
    throw new AppError('Campaign name is required', 400)
  }

  const commercialAccountId = await Scope.primaryAccountIdForActor(actor)

  return prisma.campaign.create({
    data: {
      commercialAccountId,
      name:         String(data.name).trim(),
      description:  data.description?.trim() || null,
      mode:         normalizeMode(data.mode),
      callerId:     data.callerId?.trim() || '',
      dialingRatio: normalizeNumber(data.dialingRatio ?? data.dialRatio, 1, 1, 10),
      maxRetries:   normalizeNumber(data.maxRetries, 3, 0, 20),
      retryDelay:   normalizeNumber(data.retryDelay, 300, 30, 86400),
      script:       data.script?.trim() || null,
      startTime:    data.startTime || null,
      endTime:      data.endTime || null,
      timezone:     data.timezone || 'Asia/Karachi',
      status:       'DRAFT',
    }
  })
}

export const updateCampaign = async (
  id: number,
  data: Partial<{
    name: string
    description: string
    mode: string
    callerId: string
    dialRatio: number
    dialingRatio: number
    maxRetries: number
    retryDelay: number
    script: string
    startTime: string
    endTime: string
    timezone: string
  }>
,
  actor?: AuditActor
) => {
  const existing = await prisma.campaign.findFirst({ where: { id, ...(await Scope.campaignScopeWhere(actor)) } })
  if (!existing) throw new AppError('Campaign not found', 404)

  const updateData: Record<string, unknown> = {}

  if (data.name !== undefined) {
    if (!String(data.name).trim()) throw new AppError('Campaign name is required', 400)
    updateData.name = String(data.name).trim()
  }
  if (data.description !== undefined) updateData.description = data.description?.trim() || null
  if (data.mode !== undefined) updateData.mode = normalizeMode(data.mode)
  if (data.callerId !== undefined) updateData.callerId = data.callerId?.trim() || ''
  if (data.dialingRatio !== undefined || data.dialRatio !== undefined) {
    updateData.dialingRatio = normalizeNumber(data.dialingRatio ?? data.dialRatio, existing.dialingRatio, 1, 10)
  }
  if (data.maxRetries !== undefined) updateData.maxRetries = normalizeNumber(data.maxRetries, existing.maxRetries, 0, 20)
  if (data.retryDelay !== undefined) updateData.retryDelay = normalizeNumber(data.retryDelay, existing.retryDelay, 30, 86400)
  if (data.script !== undefined) updateData.script = data.script?.trim() || null
  if (data.startTime !== undefined) updateData.startTime = data.startTime || null
  if (data.endTime !== undefined) updateData.endTime = data.endTime || null
  if (data.timezone !== undefined) updateData.timezone = data.timezone || 'Asia/Karachi'

  return prisma.campaign.update({
    where: { id },
    data: updateData,
  })
}

export const deleteCampaign = async (id: number,
  actor?: AuditActor
) => {
  const existing = await prisma.campaign.findFirst({ where: { id, ...(await Scope.campaignScopeWhere(actor)) } })
  if (!existing) throw new AppError('Campaign not found', 404)

  if (existing.status === 'ACTIVE') {
    throw new AppError('Cannot delete an active campaign — pause it first', 400)
  }

  // Delete dependent rows first so DRAFT/PAUSED/COMPLETED campaigns can be removed safely.
  await prisma.$transaction(async (tx) => {
    await tx.callback.deleteMany({
      where: {
        OR: [
          { contact: { campaignId: id } },
          { call: { campaignId: id } },
        ],
      },
    })
    await tx.call.deleteMany({ where: { campaignId: id } })
    await tx.contact.deleteMany({ where: { campaignId: id } })
    await tx.campaign.delete({ where: { id } })
  })
}

export const updateCampaignStatus = async (
  id: number,
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED',
  actor?: AuditActor,
  ipAddress?: string | null
) => {
  const existing = await prisma.campaign.findFirst({ where: { id, ...(await Scope.campaignScopeWhere(actor)) } })
  if (!existing) throw new AppError('Campaign not found', 404)

  const allowed: Record<string, string[]> = {
    DRAFT:     ['ACTIVE'],
    ACTIVE:    ['PAUSED', 'COMPLETED'],
    PAUSED:    ['ACTIVE', 'COMPLETED'],
    COMPLETED: [],
  }

  if (!allowed[existing.status].includes(status)) {
    throw new AppError(`Cannot change status from ${existing.status} to ${status}`, 400)
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data:  { status, waitingReason: status === 'ACTIVE' ? null : existing.waitingReason },
  })

  await logAuditEvent({
    actor,
    action: AUDIT_ACTIONS.CAMPAIGN_STATUS_UPDATE,
    entity: 'Campaign',
    entityId: campaign.id,
    metadata: { status: campaign.status },
    ipAddress,
  })

  return campaign
}

export const cloneCampaign = async (id: number, actor?: AuditActor) => {
  const original = await prisma.campaign.findFirst({ where: { id, ...(await Scope.campaignScopeWhere(actor)) } })
  if (!original) throw new AppError('Campaign not found', 404)

  const commercialAccountId = await Scope.primaryAccountIdForActor(actor)

  return prisma.campaign.create({
    data: {
      commercialAccountId,
      name:         `${original.name} (Copy)`,
      description:  original.description ?? undefined,
      mode:         normalizeMode(original.mode),
      callerId:     original.callerId ?? '',
      dialingRatio: original.dialingRatio ?? 1,
      maxRetries:   original.maxRetries,
      retryDelay:   original.retryDelay,
      script:       original.script ?? undefined,
      startTime:    original.startTime ?? undefined,
      endTime:      original.endTime ?? undefined,
      timezone:     original.timezone,
      status:       'DRAFT',
    }
  })
}

export const getCampaignStats = async (actor?: AuditActor) => {
  const grouped = await prisma.campaign.groupBy({
    by: ['status'],
    where: await Scope.campaignScopeWhere(actor),
    _count: { _all: true },
  })

  const counts = grouped.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all
    return acc
  }, {})

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

  return {
    total,
    draft: counts.DRAFT ?? 0,
    active: counts.ACTIVE ?? 0,
    paused: counts.PAUSED ?? 0,
    completed: counts.COMPLETED ?? 0,
  }
}
