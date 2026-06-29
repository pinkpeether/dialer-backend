import os from 'os'
import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { getRuntimeMetricsSnapshot } from './runtimeMetrics.service'
import * as Scope from './commercialScope.service'

const sinceHours = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000)

const groupRows = (rows: Array<Record<string, unknown> & { _count: { _all: number } }>, key: string) => {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = row[key]
    if (value !== null && value !== undefined) acc[String(value)] = row._count._all
    return acc
  }, {})
}

const countValues = (values: Record<string, number>) => {
  return Object.values(values).reduce((sum, count) => sum + count, 0)
}

const callbackScopeWhere = async (actor?: Scope.ScopeActor): Promise<Prisma.CallbackWhereInput> => {
  if (Scope.isPlatformActor(actor)) return {}
  const accountIds = await Scope.getActorAccountIds(actor)
  const ids = accountIds.length ? accountIds : [-1]
  return {
    OR: [
      { agent: { commercialMemberships: { some: { accountId: { in: ids }, status: 'ACTIVE' } } } },
      { call: { campaign: { commercialAccountId: { in: ids } } } },
      { contact: { campaign: { commercialAccountId: { in: ids } } } },
    ],
  }
}

const checkDb = async () => {
  const started = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - started }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message.slice(0, 300) : 'Unknown DB error',
    }
  }
}

export const getMonitoringSummary = async (actor?: Scope.ScopeActor) => {
  const generatedAt = new Date()
  const last24h = sinceHours(24)
  const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const runtime = getRuntimeMetricsSnapshot()
  const callScope = await Scope.callScopeWhere(actor)
  const campaignScope = await Scope.campaignScopeWhere(actor)
  const userScope = await Scope.userScopeWhere(actor)
  const callbackScope = await callbackScopeWhere(actor)

  // Keep this route under frontend timeout. Supabase pooler is configured with
  // connection_limit=5 locally, so these independent reads can run in a small
  // concurrent batch instead of serially adding multiple DB round-trips.
  const [
    db,
    agentRows,
    campaignRows,
    callStatusRows,
    callDispositionRows,
    overdueCallbacks,
    dueSoonCallbacks,
    activeCampaigns,
    recentCalls,
  ] = await Promise.all([
    checkDb(),
    prisma.user.groupBy({
      by: ['status'],
      where: { isActive: true, role: 'AGENT', ...userScope },
      _count: { _all: true },
    }),
    prisma.campaign.groupBy({
      by: ['status'],
      where: campaignScope,
      _count: { _all: true },
    }),
    prisma.call.groupBy({
      by: ['status'],
      where: { ...callScope, startedAt: { gte: last24h } },
      _count: { _all: true },
    }),
    prisma.call.groupBy({
      by: ['disposition'],
      where: {
        ...callScope,
        startedAt: { gte: last24h },
        disposition: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.callback.count({
      where: {
        ...callbackScope,
        status: { in: ['PENDING', 'RESCHEDULED'] },
        scheduledAt: { lt: generatedAt },
      },
    }),
    prisma.callback.count({
      where: {
        ...callbackScope,
        status: { in: ['PENDING', 'RESCHEDULED'] },
        scheduledAt: { gte: generatedAt, lte: next24h },
      },
    }),
    prisma.campaign.findMany({
      where: { ...campaignScope, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        mode: true,
        waitingReason: true,
        lastSchedulerCheckAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    }),
    prisma.call.findMany({
      where: { ...callScope, startedAt: { gte: last24h } },
      select: {
        id: true,
        status: true,
        disposition: true,
        campaignId: true,
        agentId: true,
        duration: true,
        startedAt: true,
        endedAt: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 15,
    }),
  ])

  const activeCampaignIds = activeCampaigns.map(c => c.id)

  const contactRows = activeCampaignIds.length > 0
    ? await prisma.contact.groupBy({
        by: ['campaignId', 'status'],
        where: { campaignId: { in: activeCampaignIds } },
        _count: { _all: true },
      })
    : []

  const contactsByCampaign = contactRows.reduce<Record<number, Record<string, number>>>((acc, row) => {
    if (row.campaignId === null) return acc
    acc[row.campaignId] ??= {}
    acc[row.campaignId][row.status] = row._count._all
    return acc
  }, {})

  const agentStatus = groupRows(agentRows, 'status')
  const campaignStatus = groupRows(campaignRows, 'status')
  const callStatus = groupRows(callStatusRows, 'status')
  const callDisposition = groupRows(callDispositionRows, 'disposition')

  const warnings: string[] = []

  if (!db.ok) warnings.push('DB_HEALTH_FAILED')
  if (runtime.poolTimeouts > 0) warnings.push('DB_POOL_TIMEOUT_RECORDED')
  if (runtime.recent.errorRatePercent >= 10) warnings.push('HIGH_API_ERROR_RATE')
  if (runtime.recent.p95LatencyMs > 5000) warnings.push('HIGH_API_LATENCY')
  if ((agentStatus.READY ?? 0) === 0 && (campaignStatus.ACTIVE ?? 0) > 0) warnings.push('ACTIVE_CAMPAIGNS_WITH_NO_READY_AGENTS')
  if (overdueCallbacks > 0) warnings.push('OVERDUE_CALLBACKS_PRESENT')

  const overallStatus = !db.ok
    ? 'CRITICAL'
    : warnings.length > 0
      ? 'DEGRADED'
      : 'HEALTHY'

  return {
    generatedAt: generatedAt.toISOString(),
    status: overallStatus,
    warnings,
    db,
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      pid: process.pid,
      nodeEnv: process.env.NODE_ENV || 'development',
      platform: process.platform,
      arch: process.arch,
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      loadAverage: os.loadavg(),
    },
    api: runtime,
    agents: {
      totalActive: countValues(agentStatus),
      byStatus: agentStatus,
      ready: agentStatus.READY ?? 0,
      busy: agentStatus.BUSY ?? 0,
      offline: agentStatus.OFFLINE ?? 0,
    },
    campaigns: {
      total: countValues(campaignStatus),
      byStatus: campaignStatus,
      activeHealth: activeCampaigns.map(campaign => {
        const counts = contactsByCampaign[campaign.id] ?? {}
        return {
          id: campaign.id,
          name: campaign.name,
          mode: campaign.mode,
          waitingReason: campaign.waitingReason,
          lastSchedulerCheckAt: campaign.lastSchedulerCheckAt,
          contacts: {
            pending: counts.PENDING ?? 0,
            inQueue: counts.IN_QUEUE ?? 0,
            calling: counts.CALLING ?? 0,
            answered: (counts.ANSWERED ?? 0) + (counts.CONTACTED ?? 0) + (counts.DONE ?? 0),
            failed: counts.FAILED ?? 0,
            dnc: counts.DNC ?? 0,
          },
        }
      }),
    },
    calls24h: {
      total: countValues(callStatus),
      byStatus: callStatus,
      byDisposition: callDisposition,
      recent: recentCalls,
    },
    callbacks: {
      overdue: overdueCallbacks,
      dueNext24h: dueSoonCallbacks,
    },
  }
}
