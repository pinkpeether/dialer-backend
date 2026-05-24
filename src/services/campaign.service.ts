import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'
import { AUDIT_ACTIONS } from '../constants/auditActions'

type AuditActor = { id: number; email?: string; role?: string }

type CampaignContactStats = {
  pending: number
  answered: number
  missed: number
  active: number
  total: number
  answerRate: number
}

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
  const answered = (counts.ANSWERED ?? 0) + (counts.DONE ?? 0)
  const missed = (counts.NO_ANSWER ?? 0) + (counts.BUSY ?? 0)
  const active = counts.CALLING ?? 0
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const dialed = total - pending

  return {
    pending,
    answered,
    missed,
    active,
    total,
    answerRate: dialed > 0 ? Math.round((answered / dialed) * 100) : 0,
  }
}

export const getAllCampaigns = async (filters: {
  status?: string
  search?: string
  page?: number
  limit?: number
}) => {
  const { status, search, page = 1, limit = 20 } = filters

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (search) {
    where.OR = [
      { name:        { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: {
        _count: {
          select: {
            contacts: true,
            calls: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.campaign.count({ where }),
  ])

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
    stats: toCampaignStats(statsByCampaign[c.id] ?? {}),
  }))

  return {
    campaigns: enriched,
    pagination: {
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    }
  }
}

export const getCampaignById = async (id: number) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
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
}) => {
  return await prisma.campaign.create({
    data: {
      name:         data.name,
      description:  data.description,
      mode:         data.mode ?? 'PROGRESSIVE',
      callerId:     data.callerId ?? '',
      dialingRatio: data.dialingRatio ?? data.dialRatio ?? 3,
      maxRetries:   data.maxRetries ?? 3,
      retryDelay:   data.retryDelay ?? 30,
      script:       data.script,
      startTime:    data.startTime,
      endTime:      data.endTime,
      timezone:     data.timezone ?? 'Asia/Karachi',
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
) => {
  const existing = await prisma.campaign.findUnique({ where: { id } })
  if (!existing) throw new AppError('Campaign not found', 404)

  const { dialRatio, ...updateData } = data

  return await prisma.campaign.update({
    where: { id },
    data: {
      ...updateData,
      ...(data.dialingRatio === undefined && dialRatio !== undefined ? { dialingRatio: dialRatio } : {}),
    },
  })
}

export const deleteCampaign = async (id: number) => {
  const existing = await prisma.campaign.findUnique({ where: { id } })
  if (!existing) throw new AppError('Campaign not found', 404)

  if (existing.status === 'ACTIVE') {
    throw new AppError('Cannot delete an active campaign — pause it first', 400)
  }

  await prisma.campaign.delete({ where: { id } })
}

export const updateCampaignStatus = async (
  id: number,
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED',
  actor?: AuditActor,
  ipAddress?: string | null
) => {
  const existing = await prisma.campaign.findUnique({ where: { id } })
  if (!existing) throw new AppError('Campaign not found', 404)

  // Validate transitions
  const allowed: Record<string, string[]> = {
    DRAFT:     ['ACTIVE'],
    ACTIVE:    ['PAUSED', 'COMPLETED'],
    PAUSED:    ['ACTIVE', 'COMPLETED'],
    COMPLETED: [],
  }

  if (!allowed[existing.status].includes(status)) {
    throw new AppError(
      `Cannot change status from ${existing.status} to ${status}`, 400
    )
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data:  { status },
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

export const cloneCampaign = async (id: number) => {
  const original = await prisma.campaign.findUnique({ where: { id } })
  if (!original) throw new AppError('Campaign not found', 404)

  return await prisma.campaign.create({
    data: {
      name:         `${original.name} (Copy)`,
      description:  original.description ?? undefined,
      mode:         original.mode ?? 'PROGRESSIVE',
      callerId:     original.callerId ?? '',
      dialingRatio: original.dialingRatio ?? 3,
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

export const getCampaignStats = async () => {
  const [total, draft, active, paused, completed] = await Promise.all([
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: 'DRAFT'     } }),
    prisma.campaign.count({ where: { status: 'ACTIVE'    } }),
    prisma.campaign.count({ where: { status: 'PAUSED'    } }),
    prisma.campaign.count({ where: { status: 'COMPLETED' } }),
  ])

  return { total, draft, active, paused, completed }
}
