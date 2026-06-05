import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

type RecordingSearchFilters = {
  page?: number
  limit?: number
  search?: string
  campaignId?: number
  agentId?: number
  status?: string
  source?: string
  from?: string
  to?: string
  minDuration?: number
  maxDuration?: number
  hasTranscript?: boolean
}

type RetentionPolicy = {
  enabled: boolean
  retentionDays: number
  deleteRecordings: boolean
  deleteTranscripts: boolean
  deleteInsights: boolean
  dryRunDefault: boolean
}

const RETENTION_SETTING_KEY = 'recordingRetentionPolicy'

const defaultRetentionPolicy = (): RetentionPolicy => ({
  enabled: false,
  retentionDays: 90,
  deleteRecordings: true,
  deleteTranscripts: false,
  deleteInsights: false,
  dryRunDefault: true,
})

const safeInt = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.floor(numeric)))
}

const toDate = (value?: string) => {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const normalizePolicy = (value: unknown): RetentionPolicy => {
  const base = defaultRetentionPolicy()
  if (!value || typeof value !== 'object') return base
  const raw = value as Record<string, unknown>

  return {
    enabled: Boolean(raw.enabled),
    retentionDays: safeInt(raw.retentionDays, base.retentionDays, 1, 3650),
    deleteRecordings: raw.deleteRecordings === undefined ? base.deleteRecordings : Boolean(raw.deleteRecordings),
    deleteTranscripts: raw.deleteTranscripts === undefined ? base.deleteTranscripts : Boolean(raw.deleteTranscripts),
    deleteInsights: raw.deleteInsights === undefined ? base.deleteInsights : Boolean(raw.deleteInsights),
    dryRunDefault: raw.dryRunDefault === undefined ? base.dryRunDefault : Boolean(raw.dryRunDefault),
  }
}

const getCutoffDate = (retentionDays: number) => {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  return cutoff
}

const buildSearchWhere = (filters: RecordingSearchFilters): Prisma.CallWhereInput => {
  const where: Prisma.CallWhereInput = {
    recordingUrl: { not: null },
  }

  if (filters.campaignId) where.campaignId = filters.campaignId
  if (filters.agentId) where.agentId = filters.agentId
  if (filters.status) where.status = filters.status as never
  if (filters.source) where.source = filters.source

  const from = toDate(filters.from)
  const to = toDate(filters.to)
  if (from || to) {
    where.startedAt = {}
    if (from) where.startedAt.gte = from
    if (to) where.startedAt.lte = to
  }

  if (Number.isFinite(filters.minDuration) || Number.isFinite(filters.maxDuration)) {
    where.duration = {}
    if (Number.isFinite(filters.minDuration)) where.duration.gte = Number(filters.minDuration)
    if (Number.isFinite(filters.maxDuration)) where.duration.lte = Number(filters.maxDuration)
  }

  if (filters.hasTranscript === true) {
    where.transcript = { isNot: null }
  } else if (filters.hasTranscript === false) {
    where.transcript = { is: null }
  }

  const search = filters.search?.trim()
  if (search) {
    where.OR = [
      { remoteNumber: { contains: search, mode: 'insensitive' } },
      { recordingSid: { contains: search, mode: 'insensitive' } },
      { contact: { phone: { contains: search, mode: 'insensitive' } } },
      { contact: { name: { contains: search, mode: 'insensitive' } } },
      { campaign: { name: { contains: search, mode: 'insensitive' } } },
      { agent: { name: { contains: search, mode: 'insensitive' } } },
      { agent: { email: { contains: search, mode: 'insensitive' } } },
    ]
  }

  return where
}

export const searchRecordings = async (filters: RecordingSearchFilters) => {
  const page = safeInt(filters.page, 1, 1, 100000)
  const limit = safeInt(filters.limit, 25, 1, 100)
  const where = buildSearchWhere(filters)

  const [items, total] = await Promise.all([
    prisma.call.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true, company: true, status: true } },
        campaign: { select: { id: true, name: true, mode: true, status: true } },
        agent: { select: { id: true, name: true, email: true, agentCode: true, extension: true } },
        transcript: { select: { id: true, status: true, provider: true, model: true, generatedAt: true, deletedAt: true } },
        insight: { select: { id: true, status: true, sentiment: true, score: true, generatedAt: true, deletedAt: true } },
      },
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.call.count({ where }),
  ])

  return {
    items: items.map((call) => ({
      id: call.id,
      callId: call.id,
      status: call.status,
      disposition: call.disposition,
      duration: call.duration || 0,
      source: call.source,
      remoteNumber: call.remoteNumber,
      recordingSid: call.recordingSid,
      recordingUrl: call.recordingUrl,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      createdAt: call.createdAt,
      contact: call.contact,
      campaign: call.campaign,
      agent: call.agent,
      transcript: call.transcript,
      insight: call.insight,
      downloadable: Boolean(call.recordingUrl),
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export const getRecordingDownload = async (callId: number) => {
  if (!Number.isFinite(callId)) throw new AppError('Invalid call id', 400)

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      contact: { select: { name: true, phone: true } },
      campaign: { select: { name: true } },
    },
  })

  if (!call) throw new AppError('Call not found', 404)
  if (!call.recordingUrl) throw new AppError('Recording is not available for this call', 404)

  const safePhone = (call.contact?.phone || call.remoteNumber || 'unknown').replace(/[^\d+]/g, '')
  const filename = `ptdt-call-${call.id}-${safePhone || 'recording'}.wav`

  return {
    callId: call.id,
    filename,
    downloadUrl: call.recordingUrl,
    provider: call.source || 'unknown',
    recordingSid: call.recordingSid,
    note: 'URL may be a signed storage URL. If expired, refresh the recording URL via existing storage refresh flow before download.',
  }
}

export const getRecordingStorageOverview = async () => {
  const [totalRecordings, callsWithDuration, transcribedRecordings, insightRecordings, bySource, byStatus] = await Promise.all([
    prisma.call.count({ where: { recordingUrl: { not: null } } }),
    prisma.call.aggregate({
      where: { recordingUrl: { not: null } },
      _sum: { duration: true },
      _avg: { duration: true },
      _max: { duration: true },
      _min: { duration: true },
    }),
    prisma.call.count({ where: { recordingUrl: { not: null }, transcript: { isNot: null } } }),
    prisma.call.count({ where: { recordingUrl: { not: null }, insight: { isNot: null } } }),
    prisma.call.groupBy({
      by: ['source'],
      where: { recordingUrl: { not: null } },
      _count: { _all: true },
    }),
    prisma.call.groupBy({
      by: ['status'],
      where: { recordingUrl: { not: null } },
      _count: { _all: true },
    }),
  ])

  const provider = process.env.RECORDING_STORAGE_PROVIDER ||
    process.env.STORAGE_PROVIDER ||
    (process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL ? 'supabase' : 'private-signed-url')

  const bucket = process.env.RECORDING_STORAGE_BUCKET ||
    process.env.SUPABASE_STORAGE_BUCKET ||
    process.env.AWS_BUCKET_NAME ||
    process.env.S3_BUCKET ||
    'not-configured'

  return {
    generatedAt: new Date().toISOString(),
    provider,
    bucket,
    totals: {
      totalRecordings,
      transcribedRecordings,
      insightRecordings,
      totalDurationSeconds: callsWithDuration._sum.duration || 0,
      averageDurationSeconds: Math.round(callsWithDuration._avg.duration || 0),
      minDurationSeconds: callsWithDuration._min.duration || 0,
      maxDurationSeconds: callsWithDuration._max.duration || 0,
    },
    bySource: bySource.map(row => ({ source: row.source || 'unknown', count: row._count._all })),
    byStatus: byStatus.map(row => ({ status: row.status, count: row._count._all })),
    storageCapabilities: {
      download: true,
      signedUrls: true,
      retentionPolicy: true,
      purgePreview: true,
      cloudflareR2Ready: Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME),
      supabaseReady: Boolean(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  }
}

export const getRetentionPolicy = async () => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: RETENTION_SETTING_KEY },
  })

  return normalizePolicy(setting?.value)
}

export const updateRetentionPolicy = async (input: Partial<RetentionPolicy>, updatedBy?: number) => {
  const existing = await getRetentionPolicy()
  const policy = normalizePolicy({ ...existing, ...input })

  await prisma.systemSetting.upsert({
    where: { key: RETENTION_SETTING_KEY },
    create: {
      key: RETENTION_SETTING_KEY,
      value: policy as unknown as Prisma.InputJsonValue,
      updatedBy,
    },
    update: {
      value: policy as unknown as Prisma.InputJsonValue,
      updatedBy,
    },
  })

  return policy
}

export const previewRetentionPurge = async (override?: Partial<RetentionPolicy>) => {
  const policy = normalizePolicy({ ...(await getRetentionPolicy()), ...(override || {}) })
  const cutoff = getCutoffDate(policy.retentionDays)

  const where: Prisma.CallWhereInput = {
    recordingUrl: { not: null },
    OR: [
      { endedAt: { lt: cutoff } },
      { endedAt: null, createdAt: { lt: cutoff } },
    ],
  }

  const [candidateCount, candidates, duration] = await Promise.all([
    prisma.call.count({ where }),
    prisma.call.findMany({
      where,
      select: {
        id: true,
        campaignId: true,
        contactId: true,
        agentId: true,
        remoteNumber: true,
        duration: true,
        recordingSid: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        campaign: { select: { name: true } },
        contact: { select: { name: true, phone: true } },
        agent: { select: { name: true, agentCode: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
    prisma.call.aggregate({
      where,
      _sum: { duration: true },
    }),
  ])

  return {
    policy,
    cutoff,
    candidateCount,
    estimatedDurationSeconds: duration._sum.duration || 0,
    sample: candidates,
  }
}

export const runRetentionPurge = async (
  options: { dryRun?: boolean; policyOverride?: Partial<RetentionPolicy> },
  actorId?: number,
) => {
  const policy = normalizePolicy({ ...(await getRetentionPolicy()), ...(options.policyOverride || {}) })
  const dryRun = options.dryRun ?? policy.dryRunDefault

  if (!policy.enabled && !dryRun) {
    throw new AppError('Retention policy is disabled. Enable it or run a dry-run preview first.', 400)
  }

  const preview = await previewRetentionPurge(policy)
  const callIds = preview.sample.map(call => call.id)

  // For safety, a single purge run is capped to the first 50 oldest recordings.
  // Run again to continue purging in controlled batches.
  if (dryRun || callIds.length === 0) {
    return {
      ...preview,
      dryRun: true,
      purgedCallIds: [],
      message: dryRun ? 'Dry run only — no records changed' : 'No eligible recordings found',
    }
  }

  const updated = {
    recordingsCleared: 0,
    transcriptsMarkedDeleted: 0,
    insightsMarkedDeleted: 0,
  }

  if (policy.deleteRecordings) {
    const result = await prisma.call.updateMany({
      where: { id: { in: callIds } },
      data: {
        recordingUrl: null,
        recordingSid: null,
        notes: `Recording purged by retention policy on ${new Date().toISOString()}${actorId ? ` by user ${actorId}` : ''}`,
      },
    })
    updated.recordingsCleared = result.count
  }

  if (policy.deleteTranscripts) {
    const result = await prisma.callTranscript.updateMany({
      where: { callId: { in: callIds }, deletedAt: null },
      data: {
        deletedAt: new Date(),
        status: 'DELETED',
        errorMessage: 'Deleted by recording retention policy',
      },
    })
    updated.transcriptsMarkedDeleted = result.count
  }

  if (policy.deleteInsights) {
    const result = await prisma.callInsight.updateMany({
      where: { callId: { in: callIds }, deletedAt: null },
      data: {
        deletedAt: new Date(),
        status: 'DELETED',
      },
    })
    updated.insightsMarkedDeleted = result.count
  }

  return {
    ...preview,
    dryRun: false,
    purgedCallIds: callIds,
    updated,
    message: 'Retention purge completed for this controlled batch',
  }
}

export const exportRecordingSearchCsv = async (filters: RecordingSearchFilters) => {
  const result = await searchRecordings({ ...filters, page: 1, limit: 1000 })
  const headers = [
    'callId',
    'campaign',
    'agent',
    'contact',
    'phone',
    'status',
    'disposition',
    'duration',
    'source',
    'recordingSid',
    'startedAt',
    'endedAt',
    'hasTranscript',
    'hasInsight',
    'downloadable',
  ]

  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  const rows = result.items.map(item => [
    item.id,
    item.campaign?.name || '',
    item.agent?.name || '',
    item.contact?.name || '',
    item.contact?.phone || item.remoteNumber || '',
    item.status || '',
    item.disposition || '',
    item.duration || 0,
    item.source || '',
    item.recordingSid || '',
    item.startedAt ? new Date(item.startedAt).toISOString() : '',
    item.endedAt ? new Date(item.endedAt).toISOString() : '',
    item.transcript && !item.transcript.deletedAt ? 'YES' : 'NO',
    item.insight && !item.insight.deletedAt ? 'YES' : 'NO',
    item.downloadable ? 'YES' : 'NO',
  ].map(escape).join(','))

  return [headers.join(','), ...rows].join('\n')
}
