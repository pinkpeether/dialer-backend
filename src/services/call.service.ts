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
  direction?: string
  page?: number
  limit?: number
  startDate?: Date
  endDate?: Date
}

export type SipCallLogInput = {
  remoteNumber: string
  direction?: string
  startedAt?: Date
  agentId?: number
}

const clampPagination = (page = 1, limit = 20) => ({
  page: Number.isFinite(page) && page > 0 ? page : 1,
  limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 20,
})

const normalizePhone = (value: string) => value.replace(/[\s\-().]/g, '').trim()

const normalizeDirection = (value?: string) => {
  const direction = value?.trim().toLowerCase()
  return direction === 'incoming' || direction === 'inbound' ? 'incoming' : 'outgoing'
}

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

const getOrCreateSystemCampaign = async () => {
  const existing = await prisma.campaign.findFirst({ where: { name: '__sip__' } })
  if (existing) return existing

  return prisma.campaign.create({
    data: {
      name: '__sip__',
      description: 'System campaign for SIP softphone calls',
      status: 'ACTIVE',
      callerId: 'SIP',
      dialingRatio: 1,
    },
  })
}

const getOrCreateSipContact = async (remoteNumber: string, campaignId: number) => {
  const phone = normalizePhone(remoteNumber) || remoteNumber.trim()
  const existing = await prisma.contact.findFirst({ where: { phone, campaignId } })
  if (existing) return existing

  return prisma.contact.create({
    data: {
      phone,
      name: `SIP ${phone}`,
      status: 'CALLING',
      campaignId,
      lastCalledAt: new Date(),
    },
  })
}

export const createSipCallLog = async (input: SipCallLogInput, user?: CallAccessUser) => {
  const remoteNumber = input.remoteNumber.trim()
  if (!remoteNumber) throw new AppError('remoteNumber is required', 400)

  const campaign = await getOrCreateSystemCampaign()
  const contact = await getOrCreateSipContact(remoteNumber, campaign.id)
  const startedAt = input.startedAt || new Date()
  const agentId = input.agentId ?? user?.id ?? null

  const call = await prisma.call.create({
    data: {
      contactId: contact.id,
      campaignId: campaign.id,
      agentId,
      status: 'ANSWERED',
      direction: normalizeDirection(input.direction),
      remoteNumber: contact.phone,
      source: 'sip',
      startedAt,
      connectedAt: startedAt,
      providerCallId: `sip:${startedAt.getTime()}`,
    },
    include: {
      contact: true,
      agent: { select: { id: true, name: true, agentCode: true } },
      campaign: { select: { id: true, name: true } },
    },
  })

  return {
    ...call,
    direction: normalizeDirection(input.direction),
    remoteNumber: contact.phone,
    source: 'sip',
  }
}

export const listCalls = async (
  filters: ListCallsFilters,
  user?: CallAccessUser
) => {
  const { campaignId, agentId, status, direction, startDate, endDate } = filters
  const { page, limit } = clampPagination(filters.page, filters.limit)

  const where: Prisma.CallWhereInput = {}

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
      campaign: { select: { id: true, name: true } },
    },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  })
  const total = await prisma.call.count({ where })

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
  callbackAt?: Date,
  user?: CallAccessUser
) => {
  const existing = await prisma.call.findUnique({
    where: { id },
    select: {
      id: true,
      contactId: true,
      agentId: true,
      startedAt: true,
      connectedAt: true,
      endedAt: true,
      duration: true,
    },
  })

  if (!existing) throw new AppError('Call not found', 404)
  ensureCanAccessCall(existing, user, 'update')

  const callbackAgentId = existing.agentId ?? user?.id
  const endedAt = existing.endedAt ?? new Date()
  const durationStart = existing.connectedAt ?? existing.startedAt
  const duration = existing.duration ?? Math.max(0, Math.round((endedAt.getTime() - durationStart.getTime()) / 1000))

  return prisma.$transaction(async (tx) => {
    const call = await tx.call.update({
      where: { id },
      data: {
        disposition,
        status: 'COMPLETED',
        endedAt,
        duration,
        ...(notes !== undefined ? { notes } : {}),
      },
      include: {
        contact: true,
        agent: { select: { id: true, name: true, agentCode: true } },
        campaign: { select: { id: true, name: true } },
      },
    })

    await tx.contact.update({
      where: { id: existing.contactId },
      data: {
        status: disposition === 'DO_NOT_CALL'
          ? 'DNC'
          : disposition === 'CALLBACK'
            ? 'CALLBACK'
            : disposition === 'VOICEMAIL'
              ? 'VOICEMAIL'
              : disposition === 'WRONG_NUMBER'
                ? 'WRONG_NUMBER'
                : disposition === 'NO_ANSWER'
                  ? 'NO_ANSWER'
                  : 'CONTACTED',
        callbackAt: disposition === 'CALLBACK' ? callbackAt : null,
      },
    })

    if (disposition !== 'CALLBACK') {
      await tx.callback.updateMany({
        where: {
          callId: id,
          status: { in: ['PENDING', 'RESCHEDULED'] },
        },
        data: { status: 'CANCELLED' },
      })
    } else if (callbackAt && callbackAgentId) {
      const pendingCallback = await tx.callback.findFirst({
        where: {
          callId: id,
          status: { in: ['PENDING', 'RESCHEDULED'] },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (pendingCallback) {
        await tx.callback.update({
          where: { id: pendingCallback.id },
          data: {
            contactId: existing.contactId,
            agentId: callbackAgentId,
            scheduledAt: callbackAt,
            notes: notes ?? pendingCallback.notes,
            status: 'PENDING',
          },
        })
      } else {
        await tx.callback.create({
          data: {
            contactId: existing.contactId,
            callId: id,
            agentId: callbackAgentId,
            scheduledAt: callbackAt,
            notes: notes ?? null,
            status: 'PENDING',
          },
        })
      }
    }

    return call
  })
}

export const markCallEnded = async (
  id: number,
  endedAtInput?: Date,
  user?: CallAccessUser
) => {
  const existing = await prisma.call.findUnique({
    where: { id },
    select: {
      id: true,
      agentId: true,
      startedAt: true,
      connectedAt: true,
      endedAt: true,
      duration: true,
    },
  })

  if (!existing) throw new AppError('Call not found', 404)
  ensureCanAccessCall(existing, user, 'update')

  const endedAt = existing.endedAt ?? endedAtInput ?? new Date()
  const durationStart = existing.connectedAt ?? existing.startedAt
  const duration = existing.duration ?? Math.max(0, Math.round((endedAt.getTime() - durationStart.getTime()) / 1000))

  return prisma.call.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      endedAt,
      duration,
    },
    include: {
      contact: true,
      agent: { select: { id: true, name: true, agentCode: true } },
      campaign: { select: { id: true, name: true } },
    },
  })
}

export const getCallsForContact = async (
  contactId: number,
  user?: CallAccessUser
) => {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true },
  })
  if (!contact) throw new AppError('Contact not found', 404)

  const where: Prisma.CallWhereInput = { contactId }
  if (user?.role === 'AGENT') where.agentId = user.id

  return prisma.call.findMany({
    where,
    include: {
      agent: { select: { id: true, name: true, agentCode: true } },
      campaign: { select: { id: true, name: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 50,
  })
}
