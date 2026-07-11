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

const normalizeDecimal = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric * 10) / 10))
}

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

const normalizeCallPriority = (value: unknown, fallback = 'NORMAL') => {
  const normalized = String(value || fallback).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
  return normalized || fallback
}

const SYSTEM_CAMPAIGN_NAMES = ['__adhoc__', '__sip__']

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
  where.name = { notIn: SYSTEM_CAMPAIGN_NAMES }
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
  predictiveEnabled?: boolean
  adaptiveDialEnabled?: boolean
  autoDialLevel?: number
  minimumHopper?: number
  maximumHopper?: number
  hopperRefillInterval?: number
  wrapUpTime?: number
  maximumAbandonRate?: number
  maximumSimultaneousCalls?: number
  maximumCallsPerAgent?: number
  callTimeout?: number
  ringTimeout?: number
  agentReservationTime?: number
  maximumQueueWait?: number
  callPriority?: string
  localCallTime?: boolean
  emergencyStopped?: boolean
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
  const mode = normalizeMode(data.mode)
  const autoDialLevel = normalizeDecimal(data.autoDialLevel ?? data.dialingRatio ?? data.dialRatio, mode === 'PREDICTIVE' ? 1.5 : 1, 0, 3)
  const minimumHopper = normalizeNumber(data.minimumHopper, 25, 1, 1000)
  const maximumHopper = Math.max(minimumHopper, normalizeNumber(data.maximumHopper, 200, 1, 5000))

  return prisma.campaign.create({
    data: {
      commercialAccountId,
      name:         String(data.name).trim(),
      description:  data.description?.trim() || null,
      mode,
      callerId:     data.callerId?.trim() || '',
      dialingRatio: normalizeNumber(data.dialingRatio ?? data.dialRatio ?? autoDialLevel, Math.max(1, Math.ceil(autoDialLevel)), 0, 3),
      predictiveEnabled: normalizeBoolean(data.predictiveEnabled, mode === 'PREDICTIVE'),
      adaptiveDialEnabled: normalizeBoolean(data.adaptiveDialEnabled, true),
      autoDialLevel,
      minimumHopper,
      maximumHopper,
      hopperRefillInterval: normalizeNumber(data.hopperRefillInterval, 30, 5, 3600),
      wrapUpTime: normalizeNumber(data.wrapUpTime, 30, 0, 3600),
      maximumAbandonRate: normalizeDecimal(data.maximumAbandonRate, 0.03, 0, 0.2),
      maximumSimultaneousCalls: normalizeNumber(data.maximumSimultaneousCalls, 50, 1, 500),
      maximumCallsPerAgent: normalizeDecimal(data.maximumCallsPerAgent, Math.max(1, autoDialLevel), 0.5, 5),
      callTimeout: normalizeNumber(data.callTimeout, 60, 5, 600),
      ringTimeout: normalizeNumber(data.ringTimeout, 30, 5, 300),
      agentReservationTime: normalizeNumber(data.agentReservationTime, 15, 1, 300),
      maximumQueueWait: normalizeNumber(data.maximumQueueWait, 45, 1, 600),
      callPriority: normalizeCallPriority(data.callPriority),
      localCallTime: normalizeBoolean(data.localCallTime, true),
      emergencyStopped: normalizeBoolean(data.emergencyStopped, false),
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
    predictiveEnabled: boolean
    adaptiveDialEnabled: boolean
    autoDialLevel: number
    minimumHopper: number
    maximumHopper: number
    hopperRefillInterval: number
    wrapUpTime: number
    maximumAbandonRate: number
    maximumSimultaneousCalls: number
    maximumCallsPerAgent: number
    callTimeout: number
    ringTimeout: number
    agentReservationTime: number
    maximumQueueWait: number
    callPriority: string
    localCallTime: boolean
    emergencyStopped: boolean
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
    const nextRatio = normalizeDecimal(data.dialingRatio ?? data.dialRatio, existing.autoDialLevel ?? existing.dialingRatio, 0, 3)
    updateData.autoDialLevel = nextRatio
    updateData.dialingRatio = normalizeNumber(nextRatio, existing.dialingRatio, 0, 3)
  }
  if (data.predictiveEnabled !== undefined) updateData.predictiveEnabled = normalizeBoolean(data.predictiveEnabled, existing.predictiveEnabled)
  if (data.adaptiveDialEnabled !== undefined) updateData.adaptiveDialEnabled = normalizeBoolean(data.adaptiveDialEnabled, existing.adaptiveDialEnabled)
  if (data.autoDialLevel !== undefined) {
    updateData.autoDialLevel = normalizeDecimal(data.autoDialLevel, existing.autoDialLevel, 0, 3)
    updateData.dialingRatio = normalizeNumber(data.autoDialLevel, existing.dialingRatio, 0, 3)
  }
  if (data.minimumHopper !== undefined) updateData.minimumHopper = normalizeNumber(data.minimumHopper, existing.minimumHopper, 1, 1000)
  if (data.maximumHopper !== undefined) updateData.maximumHopper = Math.max(Number(updateData.minimumHopper ?? existing.minimumHopper), normalizeNumber(data.maximumHopper, existing.maximumHopper, 1, 5000))
  if (data.hopperRefillInterval !== undefined) updateData.hopperRefillInterval = normalizeNumber(data.hopperRefillInterval, existing.hopperRefillInterval, 5, 3600)
  if (data.wrapUpTime !== undefined) updateData.wrapUpTime = normalizeNumber(data.wrapUpTime, existing.wrapUpTime, 0, 3600)
  if (data.maximumAbandonRate !== undefined) updateData.maximumAbandonRate = normalizeDecimal(data.maximumAbandonRate, existing.maximumAbandonRate, 0, 0.2)
  if (data.maximumSimultaneousCalls !== undefined) updateData.maximumSimultaneousCalls = normalizeNumber(data.maximumSimultaneousCalls, existing.maximumSimultaneousCalls, 1, 500)
  if (data.maximumCallsPerAgent !== undefined) updateData.maximumCallsPerAgent = normalizeDecimal(data.maximumCallsPerAgent, existing.maximumCallsPerAgent, 0.5, 5)
  if (data.callTimeout !== undefined) updateData.callTimeout = normalizeNumber(data.callTimeout, existing.callTimeout, 5, 600)
  if (data.ringTimeout !== undefined) updateData.ringTimeout = normalizeNumber(data.ringTimeout, existing.ringTimeout, 5, 300)
  if (data.agentReservationTime !== undefined) updateData.agentReservationTime = normalizeNumber(data.agentReservationTime, existing.agentReservationTime, 1, 300)
  if (data.maximumQueueWait !== undefined) updateData.maximumQueueWait = normalizeNumber(data.maximumQueueWait, existing.maximumQueueWait, 1, 600)
  if (data.callPriority !== undefined) updateData.callPriority = normalizeCallPriority(data.callPriority, existing.callPriority)
  if (data.localCallTime !== undefined) updateData.localCallTime = normalizeBoolean(data.localCallTime, existing.localCallTime)
  if (data.emergencyStopped !== undefined) updateData.emergencyStopped = normalizeBoolean(data.emergencyStopped, existing.emergencyStopped)
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
      predictiveEnabled: original.predictiveEnabled,
      adaptiveDialEnabled: original.adaptiveDialEnabled,
      autoDialLevel: original.autoDialLevel,
      minimumHopper: original.minimumHopper,
      maximumHopper: original.maximumHopper,
      hopperRefillInterval: original.hopperRefillInterval,
      wrapUpTime: original.wrapUpTime,
      maximumAbandonRate: original.maximumAbandonRate,
      maximumSimultaneousCalls: original.maximumSimultaneousCalls,
      maximumCallsPerAgent: original.maximumCallsPerAgent,
      callTimeout: original.callTimeout,
      ringTimeout: original.ringTimeout,
      agentReservationTime: original.agentReservationTime,
      maximumQueueWait: original.maximumQueueWait,
      dialStatusFilter: original.dialStatusFilter ?? undefined,
      leadPriority: original.leadPriority ?? undefined,
      callPriority: original.callPriority,
      localCallTime: original.localCallTime,
      emergencyStopped: false,
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
    where: { ...(await Scope.campaignScopeWhere(actor)), name: { notIn: SYSTEM_CAMPAIGN_NAMES } },
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
