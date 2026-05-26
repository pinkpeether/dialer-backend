import crypto from 'crypto'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'

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

type AccessOptions = {
  actor?: Actor
  ipAddress?: string | null
  baseApiUrl: string
}

type PlaybackPayload = {
  callId: number
  actorId?: number
  role?: string
  exp: number
  iat: number
}

const DEFAULT_ACCESS_TTL_SECONDS = 300

const getAccessSecret = () => {
  const secret = process.env.RECORDING_ACCESS_SECRET || process.env.JWT_SECRET
  if (!secret) throw new AppError('Recording access secret is not configured', 500)
  return secret
}

const getAccessTtlSeconds = () => {
  const parsed = Number(process.env.RECORDING_ACCESS_TTL_SECONDS)
  return Number.isFinite(parsed) && parsed >= 60 ? Math.min(parsed, 3600) : DEFAULT_ACCESS_TTL_SECONDS
}

const base64url = (input: Buffer | string) => {
  return Buffer.from(input).toString('base64url')
}

const sign = (payload: PlaybackPayload) => {
  const encoded = base64url(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', getAccessSecret())
    .update(encoded)
    .digest('base64url')

  return `${encoded}.${signature}`
}

const verify = (token: string): PlaybackPayload => {
  const [encoded, signature] = String(token || '').split('.')
  if (!encoded || !signature) throw new AppError('Invalid recording playback token', 403)

  const expected = crypto
    .createHmac('sha256', getAccessSecret())
    .update(encoded)
    .digest('base64url')

  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new AppError('Invalid recording playback token', 403)
  }

  let payload: PlaybackPayload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    throw new AppError('Invalid recording playback token', 403)
  }

  if (!payload.callId || !payload.exp || Date.now() > payload.exp * 1000) {
    throw new AppError('Recording playback token expired', 403)
  }

  return payload
}

const detectProvider = (url?: string | null) => {
  if (!url) return 'none'
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('twilio.com')) return 'twilio'
    if (host.includes('s3.amazonaws.com') || host.includes('amazonaws.com')) return 's3'
    if (host.includes('supabase.co')) return 'supabase'
    return host
  } catch {
    if (url.startsWith('file:')) return 'local-file'
    return 'unknown'
  }
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
})

const recordingInclude = {
  contact: { select: { id: true, name: true, phone: true } },
  agent: { select: { id: true, name: true, agentCode: true } },
  campaign: { select: { id: true, name: true } },
}

const getRecordingInternal = async (callId: number) => {
  if (!Number.isFinite(callId)) throw new AppError('Invalid call id', 400)

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: recordingInclude,
  })

  if (!call || !call.recordingUrl) throw new AppError('Recording not found', 404)
  return call
}

const buildWhere = (filters: RecordingFilters) => {
  const where: Record<string, unknown> = {
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
      { agent: { name: { contains: filters.search, mode: 'insensitive' } } },
    ]
  }

  return where
}

export const listRecordings = async (filters: RecordingFilters) => {
  const page = Math.max(1, filters.page || 1)
  const limit = Math.min(Math.max(1, filters.limit || 50), 100)
  const where = buildWhere(filters)

  // Sequential by design: protects small Supabase/Railway pool configurations.
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

export const getRecording = async (callId: number) => {
  const call = await getRecordingInternal(callId)
  return sanitizeRecording(call)
}

export const getRecordingAccess = async (callId: number, options: AccessOptions) => {
  const call = await getRecordingInternal(callId)
  const ttl = getAccessTtlSeconds()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = new Date((now + ttl) * 1000)

  const token = sign({
    callId: call.id,
    actorId: options.actor?.id,
    role: options.actor?.role,
    iat: now,
    exp: now + ttl,
  })

  const base = options.baseApiUrl.replace(/\/$/, '')
  const playbackUrl = `${base}/recordings/${call.id}/stream?token=${encodeURIComponent(token)}`

  await logAuditEvent({
    actor: options.actor,
    action: 'RECORDING_ACCESS_CREATED',
    entity: 'Call',
    entityId: call.id,
    ipAddress: options.ipAddress,
    metadata: {
      callId: call.id,
      recordingSid: call.recordingSid,
      provider: detectProvider(call.recordingUrl),
      expiresAt: expiresAt.toISOString(),
    },
  })

  return {
    callId: call.id,
    recordingSid: call.recordingSid,
    provider: detectProvider(call.recordingUrl),
    playbackUrl,
    // Backward-compatible alias for older frontend code. This is the signed backend URL, not the raw provider URL.
    recordingUrl: playbackUrl,
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: ttl,
  }
}

export const getRecordingPlaybackRedirect = async (callId: number, token: string) => {
  const payload = verify(token)
  if (payload.callId !== callId) throw new AppError('Recording playback token does not match call', 403)

  const call = await getRecordingInternal(callId)

  await logAuditEvent({
    actor: payload.actorId ? { id: payload.actorId, role: payload.role } : undefined,
    action: 'RECORDING_PLAYBACK_OPENED',
    entity: 'Call',
    entityId: call.id,
    metadata: {
      callId: call.id,
      recordingSid: call.recordingSid,
      provider: detectProvider(call.recordingUrl),
      tokenIssuedAt: new Date(payload.iat * 1000).toISOString(),
      tokenExpiresAt: new Date(payload.exp * 1000).toISOString(),
    },
  })

  return call.recordingUrl as string
}

export const getRecordingStorageHealth = async () => {
  const total = await prisma.call.count({ where: { recordingUrl: { not: null } } })
  const missingSid = await prisma.call.count({
    where: {
      recordingUrl: { not: null },
      recordingSid: null,
    },
  })

  const recent = await prisma.call.findMany({
    where: { recordingUrl: { not: null } },
    select: {
      id: true,
      recordingUrl: true,
      recordingSid: true,
      startedAt: true,
      duration: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 100,
  })

  const providers = recent.reduce<Record<string, number>>((acc, row) => {
    const provider = detectProvider(row.recordingUrl)
    acc[provider] = (acc[provider] || 0) + 1
    return acc
  }, {})

  const missingDuration = recent.filter(row => !row.duration || row.duration <= 0).length

  return {
    generatedAt: new Date().toISOString(),
    totalRecordings: total,
    recentSampleSize: recent.length,
    missingRecordingSid: missingSid,
    recentMissingDuration: missingDuration,
    providers,
    accessTtlSeconds: getAccessTtlSeconds(),
    retentionDays: process.env.RECORDING_RETENTION_DAYS ? Number(process.env.RECORDING_RETENTION_DAYS) : null,
    storageStatus: total === 0
      ? 'EMPTY'
      : missingSid > 0 || missingDuration > 0
        ? 'DEGRADED'
        : 'HEALTHY',
  }
}
