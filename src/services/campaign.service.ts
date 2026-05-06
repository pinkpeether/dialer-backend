import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

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

  // Add extra stats per campaign
  const enriched = await Promise.all(
    campaigns.map(async (c) => {
      const [pending, answered, missed, active] = await Promise.all([
        prisma.contact.count({ where: { campaignId: c.id, status: 'PENDING' } }),
        prisma.contact.count({ where: { campaignId: c.id, status: { in: ['ANSWERED', 'DONE'] } } }),
        prisma.contact.count({ where: { campaignId: c.id, status: { in: ['NO_ANSWER', 'BUSY'] } } }),
        prisma.contact.count({ where: { campaignId: c.id, status: 'CALLING' } }),
      ])
      return { ...c, stats: { pending, answered, missed, active } }
    })
  )

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

  const [pending, answered, missed, active, calling] = await Promise.all([
    prisma.contact.count({ where: { campaignId: id, status: 'PENDING'  } }),
    prisma.contact.count({ where: { campaignId: id, status: { in: ['ANSWERED', 'DONE'] } } }),
    prisma.contact.count({ where: { campaignId: id, status: { in: ['NO_ANSWER', 'BUSY'] } } }),
    prisma.contact.count({ where: { campaignId: id, status: 'CALLING'  } }),
    prisma.contact.count({ where: { campaignId: id, status: 'CALLING'  } }),
  ])

  const total     = pending + answered + missed + calling
  const answerRate = total > 0 ? Math.round((answered / total) * 100) : 0

  return {
    ...campaign,
    stats: { pending, answered, missed, active, total, answerRate }
  }
}

export const createCampaign = async (data: {
  name: string
  description?: string
  dialRatio?: number
  maxRetries?: number
  retryDelay?: number
  script?: string
  startTime?: string
  endTime?: string
  timezone?: string
}) => {
  return await prisma.campaign.create({
    data: {
      name:        data.name,
      description: data.description,
      dialRatio:   data.dialRatio   || 3,
      maxRetries:  data.maxRetries  || 3,
      retryDelay:  data.retryDelay  || 30,
      script:      data.script,
      startTime:   data.startTime,
      endTime:     data.endTime,
      timezone:    data.timezone    || 'Asia/Karachi',
      status:      'DRAFT',
    }
  })
}

export const updateCampaign = async (
  id: number,
  data: Partial<{
    name: string
    description: string
    dialRatio: number
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

  return await prisma.campaign.update({ where: { id }, data })
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
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
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

  return await prisma.campaign.update({
    where: { id },
    data:  { status },
  })
}

export const cloneCampaign = async (id: number) => {
  const original = await prisma.campaign.findUnique({ where: { id } })
  if (!original) throw new AppError('Campaign not found', 404)

  return await prisma.campaign.create({
    data: {
      name:        `${original.name} (Copy)`,
      description: original.description ?? undefined,
      dialRatio:   original.dialRatio,
      maxRetries:  original.maxRetries,
      retryDelay:  original.retryDelay,
      script:      original.script ?? undefined,
      startTime:   original.startTime ?? undefined,
      endTime:     original.endTime ?? undefined,
      timezone:    original.timezone,
      status:      'DRAFT',
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