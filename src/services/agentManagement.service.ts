import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

type DateRange = {
  from: Date
  to: Date
}

type AgentScore = {
  agentId: number
  name: string
  email: string
  agentCode: string | null
  status: string | null
  totalCalls: number
  answeredCalls: number
  callbacks: number
  dnc: number
  talkSeconds: number
  answerRate: number
  points: number
  badge: string
}

type ActiveAgentSession = {
  agentId: number
  userEmail?: string
  clientFingerprint: string
  startedAt: Date
  lastSeenAt: Date
  userAgent?: string
  ipAddress?: string | null
}

const activeSessions = new Map<number, ActiveAgentSession>()

const shiftOverrides = new Map<number, {
  startTime: string
  endTime: string
  timezone: string
  breakEveryMinutes: number
  updatedAt: Date
}>()

const DAY_MS = 24 * 60 * 60 * 1000

const toStartOfDay = (value: Date) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const toEndOfDay = (value: Date) => {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

const parseDateRange = (query: { from?: unknown; to?: unknown; days?: unknown }): DateRange => {
  const days = Math.max(1, Math.min(90, Number(query.days || 7)))
  const now = new Date()

  const from = query.from ? new Date(String(query.from)) : new Date(now.getTime() - (days - 1) * DAY_MS)
  const to = query.to ? new Date(String(query.to)) : now

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new AppError('Invalid date range', 400)
  }

  return {
    from: toStartOfDay(from),
    to: toEndOfDay(to),
  }
}

const calculateBadge = (points: number) => {
  if (points >= 1000) return 'PLATINUM'
  if (points >= 600) return 'GOLD'
  if (points >= 300) return 'SILVER'
  if (points >= 100) return 'BRONZE'
  return 'STARTER'
}

const scoreAgent = (agent: {
  id: number
  name: string | null
  email: string
  agentCode: string | null
  status: string | null
}, calls: Array<{
  disposition: string | null
  duration: number | null
}>) : AgentScore => {
  const totalCalls = calls.length
  const answeredCalls = calls.filter(call =>
    ['ANSWERED', 'CONTACTED', 'DONE', 'SALE', 'COMPLETED'].includes(String(call.disposition || '').toUpperCase())
  ).length
  const callbacks = calls.filter(call => String(call.disposition || '').toUpperCase() === 'CALLBACK').length
  const dnc = calls.filter(call => String(call.disposition || '').toUpperCase() === 'DO_NOT_CALL').length
  const talkSeconds = calls.reduce((sum, call) => sum + Math.max(0, Number(call.duration || 0)), 0)
  const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0

  const points =
    answeredCalls * 20 +
    callbacks * 8 +
    Math.floor(talkSeconds / 60) -
    dnc * 5

  return {
    agentId: agent.id,
    name: agent.name || agent.email,
    email: agent.email,
    agentCode: agent.agentCode,
    status: agent.status,
    totalCalls,
    answeredCalls,
    callbacks,
    dnc,
    talkSeconds,
    answerRate,
    points: Math.max(0, points),
    badge: calculateBadge(Math.max(0, points)),
  }
}

const getAgentUsers = async () => {
  return prisma.user.findMany({
    where: {
      role: { in: ['AGENT', 'SUPERVISOR', 'ADMIN'] },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      agentCode: true,
      role: true,
      status: true,
      isActive: true,
      updatedAt: true,
    },
    orderBy: [
      { role: 'asc' },
      { name: 'asc' },
    ],
  })
}

export const getAgentOverview = async (query: { from?: unknown; to?: unknown; days?: unknown }) => {
  const range = parseDateRange(query)
  const agents = await getAgentUsers()

  const calls = await prisma.call.findMany({
    where: {
      agentId: { in: agents.map(agent => agent.id) },
      startedAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      agentId: true,
      status: true,
      disposition: true,
      duration: true,
      startedAt: true,
      endedAt: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 5000,
  })

  const totalAgents = agents.length
  const readyAgents = agents.filter(agent => agent.status === 'READY').length
  const busyAgents = agents.filter(agent => agent.status === 'BUSY').length
  const offlineAgents = agents.filter(agent => agent.status === 'OFFLINE').length
  const activeSessionCount = activeSessions.size
  const totalCalls = calls.length
  const answeredCalls = calls.filter(call =>
    ['ANSWERED', 'CONTACTED', 'DONE', 'SALE', 'COMPLETED'].includes(String(call.disposition || '').toUpperCase())
  ).length
  const talkSeconds = calls.reduce((sum, call) => sum + Math.max(0, Number(call.duration || 0)), 0)

  return {
    generatedAt: new Date().toISOString(),
    range,
    totals: {
      totalAgents,
      readyAgents,
      busyAgents,
      offlineAgents,
      activeSessionCount,
      totalCalls,
      answeredCalls,
      answerRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
      talkSeconds,
    },
    reminders: buildBreakReminders(agents),
    note: 'Advanced agent management uses existing users/calls data and an in-memory session guard. Add DB persistence later if multi-instance session locking is required.',
  }
}

export const getLeaderboard = async (query: {
  from?: unknown
  to?: unknown
  days?: unknown
  limit?: unknown
}) => {
  const range = parseDateRange(query)
  const limit = Math.max(1, Math.min(100, Number(query.limit || 20)))
  const agents = await getAgentUsers()

  const calls = await prisma.call.findMany({
    where: {
      agentId: { in: agents.map(agent => agent.id) },
      startedAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      agentId: true,
      disposition: true,
      duration: true,
    },
    take: 10000,
  })

  const callsByAgent = calls.reduce<Record<number, typeof calls>>((acc, call) => {
    if (!call.agentId) return acc
    acc[call.agentId] ??= []
    acc[call.agentId].push(call)
    return acc
  }, {})

  const leaderboard = agents
    .map(agent => scoreAgent(agent, callsByAgent[agent.id] || []))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }))

  return {
    generatedAt: new Date().toISOString(),
    range,
    leaderboard,
  }
}

export const getAgentPerformance = async (query: {
  from?: unknown
  to?: unknown
  days?: unknown
  agentId?: unknown
}) => {
  const range = parseDateRange(query)
  const agentId = query.agentId ? Number(query.agentId) : null

  const agents = await getAgentUsers()
  const filteredAgents = agentId
    ? agents.filter(agent => agent.id === agentId)
    : agents

  if (agentId && filteredAgents.length === 0) {
    throw new AppError('Agent not found', 404)
  }

  const calls = await prisma.call.findMany({
    where: {
      agentId: { in: filteredAgents.map(agent => agent.id) },
      startedAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      id: true,
      agentId: true,
      status: true,
      disposition: true,
      duration: true,
      startedAt: true,
      endedAt: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 10000,
  })

  const callsByAgent = calls.reduce<Record<number, typeof calls>>((acc, call) => {
    if (!call.agentId) return acc
    acc[call.agentId] ??= []
    acc[call.agentId].push(call)
    return acc
  }, {})

  const performance = filteredAgents.map(agent => {
    const agentCalls = callsByAgent[agent.id] || []
    const base = scoreAgent(agent, agentCalls)
    return {
      ...base,
      role: agent.role,
      activeSession: activeSessions.get(agent.id) || null,
      recentCalls: agentCalls.slice(0, 10),
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    range,
    agents: performance,
  }
}

export const getShiftPlan = async (query: { date?: unknown }) => {
  const date = query.date ? new Date(String(query.date)) : new Date()
  if (Number.isNaN(date.getTime())) throw new AppError('Invalid shift date', 400)

  const agents = await getAgentUsers()

  return {
    generatedAt: new Date().toISOString(),
    date: date.toISOString().slice(0, 10),
    shifts: agents.map(agent => {
      const override = shiftOverrides.get(agent.id)
      const startTime = override?.startTime || '09:00'
      const endTime = override?.endTime || '17:00'
      const timezone = override?.timezone || 'Asia/Karachi'
      const breakEveryMinutes = override?.breakEveryMinutes || 90

      return {
        agentId: agent.id,
        name: agent.name || agent.email,
        email: agent.email,
        agentCode: agent.agentCode,
        role: agent.role,
        status: agent.status,
        startTime,
        endTime,
        timezone,
        breakEveryMinutes,
        activeSession: activeSessions.has(agent.id),
        reminder: buildBreakReminder(agent, breakEveryMinutes),
      }
    }),
  }
}

export const updateShiftPreference = async (
  agentId: number,
  payload: {
    startTime?: unknown
    endTime?: unknown
    timezone?: unknown
    breakEveryMinutes?: unknown
  }
) => {
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, email: true, agentCode: true, status: true },
  })
  if (!agent) throw new AppError('Agent not found', 404)

  const startTime = String(payload.startTime || '09:00')
  const endTime = String(payload.endTime || '17:00')
  const timezone = String(payload.timezone || 'Asia/Karachi')
  const breakEveryMinutes = Math.max(15, Math.min(240, Number(payload.breakEveryMinutes || 90)))

  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
    throw new AppError('Shift times must use HH:mm format', 400)
  }

  shiftOverrides.set(agentId, {
    startTime,
    endTime,
    timezone,
    breakEveryMinutes,
    updatedAt: new Date(),
  })

  return {
    agent,
    shift: shiftOverrides.get(agentId),
    note: 'Shift preference is stored in-memory for pilot mode. Add DB migration later for durable shift schedules.',
  }
}

const buildBreakReminder = (
  agent: {
    id: number
    name: string | null
    email: string
    status: string | null
    updatedAt: Date
  },
  breakEveryMinutes = 90
) => {
  const minutesSinceStatusChange = Math.floor((Date.now() - new Date(agent.updatedAt).getTime()) / 60000)
  const shouldNotify = ['READY', 'BUSY'].includes(String(agent.status || '').toUpperCase())
    && minutesSinceStatusChange >= breakEveryMinutes

  return {
    agentId: agent.id,
    name: agent.name || agent.email,
    email: agent.email,
    status: agent.status,
    minutesSinceStatusChange,
    breakEveryMinutes,
    shouldNotify,
    severity: shouldNotify ? (minutesSinceStatusChange >= breakEveryMinutes * 2 ? 'HIGH' : 'MEDIUM') : 'LOW',
  }
}

const buildBreakReminders = (agents: Awaited<ReturnType<typeof getAgentUsers>>) => {
  return agents
    .map(agent => {
      const override = shiftOverrides.get(agent.id)
      return buildBreakReminder(agent, override?.breakEveryMinutes || 90)
    })
    .filter(reminder => reminder.shouldNotify)
}

export const getBreakReminders = async () => {
  const agents = await getAgentUsers()
  return {
    generatedAt: new Date().toISOString(),
    reminders: buildBreakReminders(agents),
  }
}

export const startAgentSession = async (
  agentId: number,
  userEmail: string | undefined,
  clientFingerprint: string,
  userAgent?: string,
  ipAddress?: string | null
) => {
  if (!clientFingerprint || clientFingerprint.length < 8) {
    throw new AppError('clientFingerprint is required for single-session enforcement', 400)
  }

  const existing = activeSessions.get(agentId)
  if (existing && existing.clientFingerprint !== clientFingerprint) {
    throw new AppError('Agent already has an active session on another device', 409)
  }

  const now = new Date()
  const session: ActiveAgentSession = {
    agentId,
    userEmail,
    clientFingerprint,
    startedAt: existing?.startedAt || now,
    lastSeenAt: now,
    userAgent,
    ipAddress,
  }

  activeSessions.set(agentId, session)

  return {
    session,
    singleSessionEnforced: true,
  }
}

export const endAgentSession = async (agentId: number) => {
  const existing = activeSessions.get(agentId)
  activeSessions.delete(agentId)
  return {
    ended: Boolean(existing),
    endedSession: existing || null,
  }
}

export const listAgentSessions = async () => {
  return {
    generatedAt: new Date().toISOString(),
    sessions: Array.from(activeSessions.values()).sort(
      (a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime()
    ),
  }
}
