import prisma from '../lib/prisma'
import * as Scope from './commercialScope.service'

type Actor = { id: number; email?: string; role?: string } | undefined

type RecordingFilters = {
  from?: Date
  to?: Date
  agentId?: number
  campaignId?: number
  search?: string
  page?: number
  limit?: number
}

const commercialAccountSelect = {
  id: true,
  name: true,
  code: true,
  status: true,
} as const

const detectProvider = (url?: string | null) => {
  if (!url) return 'none'
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('provider.com')) return 'provider'
    if (host.includes('s3.amazonaws.com') || host.includes('amazonaws.com')) return 's3'
    if (host.includes('supabase.co')) return 'supabase'
    return host
  } catch {
    if (url.startsWith('file:')) return 'local-file'
    return 'unknown'
  }
}

const recordingInclude = {
  contact: { select: { id: true, name: true, phone: true } },
  agent: { select: { id: true, name: true, agentCode: true } },
  campaign: {
    select: {
      id: true,
      name: true,
      commercialAccount: { select: commercialAccountSelect },
    },
  },
}

const sanitizeRecording = (call: any) => ({
  id: call.id,
  contactId: call.contactId,
  campaignId: call.campaignId,
  agentId: call.agentId,
  status: call.status,
  disposition: call.disposition,
  direction: call.direction,
  remoteNumber: call.remoteNumber,
  duration: call.duration,
  startedAt: call.startedAt,
  endedAt: call.endedAt,
  createdAt: call.createdAt,
  updatedAt: call.updatedAt,
  recordingSid: call.recordingSid,
  hasRecording: Boolean(call.recordingUrl),
  recordingAvailable: Boolean(call.recordingUrl),
  recordingProvider: detectProvider(call.recordingUrl),
  contact: call.contact,
  agent: call.agent,
  campaign: call.campaign,
  commercialAccount: call.campaign?.commercialAccount || null,
})

const buildWhere = async (filters: RecordingFilters, actor?: Actor) => {
  const where: Record<string, unknown> = {
    ...(actor ? await Scope.callScopeWhere(actor) : {}),
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
      { recordingSid: { contains: filters.search, mode: 'insensitive' } },
      { contact: { name: { contains: filters.search, mode: 'insensitive' } } },
      { contact: { phone: { contains: filters.search, mode: 'insensitive' } } },
      { campaign: { name: { contains: filters.search, mode: 'insensitive' } } },
      { campaign: { commercialAccount: { name: { contains: filters.search, mode: 'insensitive' } } } },
      { agent: { name: { contains: filters.search, mode: 'insensitive' } } },
    ]
  }

  return where
}

export const listRecordingsWithAccounts = async (filters: RecordingFilters, actor?: Actor) => {
  const page = Math.max(1, filters.page || 1)
  const limit = Math.min(Math.max(1, filters.limit || 50), 100)
  const where = await buildWhere(filters, actor)

  const recordings = await prisma.call.findMany({
    where,
    include: recordingInclude,
    orderBy: { startedAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
  const total = await prisma.call.count({ where })

  return {
    recordings: recordings.map(sanitizeRecording),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}
