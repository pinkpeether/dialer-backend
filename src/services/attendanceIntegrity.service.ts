import type { AttendanceEventType, AttendanceSessionStatus, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'
import { isPlatformActor, userScopeWhere, type ScopeActor } from './commercialScope.service'

type ClockMetadata = {
  browser?: string
  operatingSystem?: string
  localIp?: string
  timezone?: string
  deviceFingerprint?: string
  userAgent?: string
  currentUrl?: string
  tabVisible?: boolean
  lastInteractionAt?: string
  mouseActivity?: boolean
  keyboardActivity?: boolean
}

const ACTIVE_STATUSES: AttendanceSessionStatus[] = ['CLOCKED_IN', 'IDLE', 'ON_BREAK', 'PENDING_SUPERVISOR_REVIEW']
const MAX_SHIFT_SECONDS = Number(process.env.ATTENDANCE_MAX_SHIFT_SECONDS || 43_200)
const MISSED_HEARTBEAT_SECONDS = Number(process.env.ATTENDANCE_MISSED_HEARTBEAT_SECONDS || 180)

const publicIpFrom = (reqIp?: string | null) => reqIp?.replace('::ffff:', '') || null

const nowSecondsSince = (date?: Date | null) => {
  if (!date) return 0
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
}

const workedSecondsFor = (clockInAt: Date, clockOutAt?: Date | null) =>
  Math.max(0, Math.floor(((clockOutAt || new Date()).getTime() - clockInAt.getTime()) / 1000))

const event = async (data: {
  sessionId: number
  userId: number
  type: AttendanceEventType
  metadata?: unknown
  ipAddress?: string | null
}) => prisma.attendanceEvent.create({
  data: {
    sessionId: data.sessionId,
    userId: data.userId,
    type: data.type,
    metadata: data.metadata === undefined ? undefined : data.metadata as Prisma.InputJsonValue,
    ipAddress: data.ipAddress || null,
  },
})

const verifySessionAccess = async (sessionId: number, actor?: ScopeActor) => {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: { user: true },
  })
  if (!session) throw new AppError('Attendance session not found', 404)
  if (isPlatformActor(actor) || session.userId === actor?.id) return session
  const scope = await userScopeWhere(actor)
  const user = await prisma.user.findFirst({ where: { id: session.userId, ...scope }, select: { id: true } })
  if (!user) throw new AppError('Attendance session is outside your team scope', 403)
  return session
}

export const clockIn = async (actor: ScopeActor, metadata: ClockMetadata, ipAddress?: string | null) => {
  if (!actor?.id) throw new AppError('Unauthorized', 401)
  const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { id: true, role: true } })
  if (!user) throw new AppError('User not found', 404)

  const active = await prisma.attendanceSession.findFirst({
    where: { userId: actor.id, status: { in: ACTIVE_STATUSES } },
    orderBy: { clockInAt: 'desc' },
  })
  if (active) return active

  const sessionKey = `${actor.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const session = await prisma.attendanceSession.create({
    data: {
      userId: actor.id,
      role: String(user.role),
      sessionKey,
      browser: metadata.browser || null,
      operatingSystem: metadata.operatingSystem || null,
      publicIp: publicIpFrom(ipAddress),
      localIp: metadata.localIp || null,
      timezone: metadata.timezone || null,
      deviceFingerprint: metadata.deviceFingerprint || null,
      userAgent: metadata.userAgent || null,
      lastHeartbeatAt: new Date(),
    },
  })
  await event({ sessionId: session.id, userId: actor.id, type: 'CLOCK_IN', metadata, ipAddress })
  await logAuditEvent({ actor, action: 'ATTENDANCE_CLOCK_IN', entity: 'AttendanceSession', entityId: session.id, metadata, ipAddress })
  return session
}

export const clockOut = async (actor: ScopeActor, sessionId?: number, metadata?: ClockMetadata, ipAddress?: string | null) => {
  if (!actor?.id) throw new AppError('Unauthorized', 401)
  const active = sessionId
    ? await verifySessionAccess(sessionId, actor)
    : await prisma.attendanceSession.findFirst({
      where: { userId: actor.id, status: { in: ACTIVE_STATUSES } },
      orderBy: { clockInAt: 'desc' },
    })
  if (!active) throw new AppError('No active attendance session found', 404)
  if (active.userId !== actor.id && !isPlatformActor(actor)) throw new AppError('Only platform admins can close another user attendance session', 403)

  const clockOutAt = new Date()
  const totalWorkedSeconds = workedSecondsFor(active.clockInAt, clockOutAt)
  const session = await prisma.attendanceSession.update({
    where: { id: active.id },
    data: {
      clockOutAt,
      totalWorkedSeconds,
      productiveSeconds: Math.max(0, totalWorkedSeconds - active.idleSeconds - active.totalBreakSeconds),
      status: 'CLOCKED_OUT',
      lastHeartbeatAt: clockOutAt,
    },
  })
  await event({ sessionId: session.id, userId: session.userId, type: 'CLOCK_OUT', metadata, ipAddress })
  await logAuditEvent({ actor, action: 'ATTENDANCE_CLOCK_OUT', entity: 'AttendanceSession', entityId: session.id, metadata: { totalWorkedSeconds }, ipAddress })
  return session
}

export const heartbeat = async (actor: ScopeActor, sessionId: number | undefined, metadata: ClockMetadata, ipAddress?: string | null) => {
  if (!actor?.id) throw new AppError('Unauthorized', 401)
  const active = sessionId
    ? await verifySessionAccess(sessionId, actor)
    : await prisma.attendanceSession.findFirst({
      where: { userId: actor.id, status: { in: ACTIVE_STATUSES } },
      orderBy: { clockInAt: 'desc' },
    })
  if (!active) throw new AppError('No active attendance session found', 404)
  if (active.userId !== actor.id) throw new AppError('Cannot heartbeat another user attendance session', 403)

  const totalWorkedSeconds = workedSecondsFor(active.clockInAt)
  const redFlag = active.redFlag || totalWorkedSeconds > MAX_SHIFT_SECONDS
  const redFlagReason = redFlag && !active.redFlagReason ? 'Active session exceeded maximum shift length.' : active.redFlagReason
  const updated = await prisma.attendanceSession.update({
    where: { id: active.id },
    data: {
      lastHeartbeatAt: new Date(),
      totalWorkedSeconds,
      productiveSeconds: Math.max(0, totalWorkedSeconds - active.idleSeconds - active.totalBreakSeconds),
      publicIp: publicIpFrom(ipAddress),
      localIp: metadata.localIp || active.localIp,
      timezone: metadata.timezone || active.timezone,
      userAgent: metadata.userAgent || active.userAgent,
      redFlag,
      redFlagReason,
    },
  })
  await event({ sessionId: updated.id, userId: updated.userId, type: 'HEARTBEAT', metadata, ipAddress })
  return updated
}

export const markDisconnect = async (actor: ScopeActor, sessionId: number, metadata: ClockMetadata, ipAddress?: string | null) => {
  const active = await verifySessionAccess(sessionId, actor)
  const updated = await prisma.attendanceSession.update({
    where: { id: active.id },
    data: {
      status: 'UNEXPECTED_DISCONNECT',
      disconnectCount: { increment: 1 },
      redFlag: true,
      redFlagReason: active.redFlagReason || 'Browser/tab closed, network disconnected, or heartbeat stopped.',
    },
  })
  await event({ sessionId: updated.id, userId: updated.userId, type: 'DISCONNECT', metadata, ipAddress })
  await logAuditEvent({ actor, action: 'ATTENDANCE_UNEXPECTED_DISCONNECT', entity: 'AttendanceSession', entityId: updated.id, metadata, ipAddress })
  return updated
}

export const getMyActiveSession = async (actor: ScopeActor) => {
  if (!actor?.id) throw new AppError('Unauthorized', 401)
  return prisma.attendanceSession.findFirst({
    where: { userId: actor.id, status: { in: ACTIVE_STATUSES } },
    orderBy: { clockInAt: 'desc' },
    include: { events: { orderBy: { createdAt: 'desc' }, take: 10 } },
  })
}

export const listOverview = async (actor: ScopeActor, filters: { status?: string; from?: Date; to?: Date; limit?: number }) => {
  const userWhere = await userScopeWhere(actor)
  const roleWhere: Prisma.UserWhereInput = { role: { in: ['AGENT', 'SUPERVISOR'] } }
  const users = await prisma.user.findMany({
    where: { AND: [userWhere, roleWhere] },
    select: { id: true, name: true, email: true, role: true, status: true, isActive: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filters.limit || 250, 500),
  })
  const userIds = users.map(user => user.id)
  const sessionWhere: Prisma.AttendanceSessionWhereInput = {
    userId: { in: userIds.length ? userIds : [-1] },
    ...(filters.status ? { status: filters.status as AttendanceSessionStatus } : {}),
    ...(filters.from || filters.to ? { clockInAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
  }
  const sessions = await prisma.attendanceSession.findMany({
    where: sessionWhere,
    orderBy: { clockInAt: 'desc' },
    include: { events: { orderBy: { createdAt: 'desc' }, take: 5 } },
    take: Math.min((filters.limit || 250) * 2, 700),
  })
  const latestByUser = new Map<number, typeof sessions[number]>()
  for (const session of sessions) {
    if (!latestByUser.has(session.userId)) latestByUser.set(session.userId, session)
  }

  const now = new Date()
  const staleActiveIds = sessions
    .filter(session => ACTIVE_STATUSES.includes(session.status) && session.lastHeartbeatAt && nowSecondsSince(session.lastHeartbeatAt) > MISSED_HEARTBEAT_SECONDS)
    .map(session => session.id)

  const rows = users.map(user => {
    const session = latestByUser.get(user.id) || null
    const activeSeconds = session && ACTIVE_STATUSES.includes(session.status) ? workedSecondsFor(session.clockInAt) : session?.totalWorkedSeconds || 0
    const heartbeatAgeSeconds = session?.lastHeartbeatAt ? nowSecondsSince(session.lastHeartbeatAt) : null
    const status = session && staleActiveIds.includes(session.id) ? 'UNEXPECTED_DISCONNECT' : session?.status || 'NO_SESSION'
    return {
      user,
      session,
      status,
      activeSeconds,
      heartbeatAgeSeconds,
      needsReview: Boolean(session?.redFlag || status === 'UNEXPECTED_DISCONNECT' || status === 'MISSED_CLOCK_OUT'),
    }
  })

  const summary = {
    totalUsers: users.length,
    clockedIn: rows.filter(row => row.status === 'CLOCKED_IN' || row.status === 'IDLE' || row.status === 'ON_BREAK').length,
    unexpectedDisconnects: rows.filter(row => row.status === 'UNEXPECTED_DISCONNECT').length,
    needsReview: rows.filter(row => row.needsReview).length,
    redFlags: sessions.filter(session => session.redFlag).length,
  }

  return { summary, rows, serverTime: now.toISOString(), heartbeatTimeoutSeconds: MISSED_HEARTBEAT_SECONDS }
}

export const reviewSession = async (actor: ScopeActor, sessionId: number, payload: { status?: AttendanceSessionStatus; notes?: string; removeFlag?: boolean }, ipAddress?: string | null) => {
  const session = await verifySessionAccess(sessionId, actor)
  if (!isPlatformActor(actor) && actor?.role !== 'CUSTOMER_ADMIN' && actor?.role !== 'SUPERVISOR') {
    throw new AppError('Supervisor or admin access required', 403)
  }
  const updated = await prisma.attendanceSession.update({
    where: { id: session.id },
    data: {
      ...(payload.status ? { status: payload.status } : {}),
      ...(typeof payload.notes === 'string' ? { supervisorNotes: payload.notes } : {}),
      ...(payload.removeFlag ? { redFlag: false, redFlagReason: null } : {}),
    },
  })
  await event({ sessionId: updated.id, userId: updated.userId, type: 'SUPERVISOR_OVERRIDE', metadata: payload, ipAddress })
  await logAuditEvent({ actor, action: 'ATTENDANCE_SUPERVISOR_REVIEW', entity: 'AttendanceSession', entityId: updated.id, metadata: payload, ipAddress })
  return updated
}
