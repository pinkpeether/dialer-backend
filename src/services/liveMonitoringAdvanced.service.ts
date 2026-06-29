import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import * as Scope from './commercialScope.service'

type RegionBucket = {
  key: string
  label: string
  lat: number
  lng: number
}

const ACTIVE_CALL_STATUSES = ['INITIATED', 'RINGING', 'ANSWERED'] as const
const AGENT_LIVE_STATUSES = ['ONLINE', 'READY', 'BUSY', 'WRAP_UP'] as const

const REGION_BUCKETS: RegionBucket[] = [
  { key: '+92', label: 'Pakistan', lat: 30.3753, lng: 69.3451 },
  { key: '+1', label: 'North America', lat: 39.8283, lng: -98.5795 },
  { key: '+44', label: 'United Kingdom', lat: 55.3781, lng: -3.4360 },
  { key: '+971', label: 'United Arab Emirates', lat: 23.4241, lng: 53.8478 },
  { key: '+966', label: 'Saudi Arabia', lat: 23.8859, lng: 45.0792 },
  { key: '+974', label: 'Qatar', lat: 25.3548, lng: 51.1839 },
  { key: '+973', label: 'Bahrain', lat: 25.9304, lng: 50.6378 },
  { key: '+968', label: 'Oman', lat: 21.4735, lng: 55.9754 },
  { key: '+965', label: 'Kuwait', lat: 29.3117, lng: 47.4818 },
  { key: '+91', label: 'India', lat: 20.5937, lng: 78.9629 },
]

const getSinceDate = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000)

const normalizePhone = (phone?: string | null) => String(phone || '').replace(/[^+\d]/g, '')

const detectRegion = (phone?: string | null): RegionBucket => {
  const normalized = normalizePhone(phone)
  const match = REGION_BUCKETS
    .sort((a, b) => b.key.length - a.key.length)
    .find(bucket => normalized.startsWith(bucket.key))

  return match || { key: 'unknown', label: 'Unknown / Unmapped', lat: 20, lng: 0 }
}

const calculateAnswerRate = (answered: number, total: number) => {
  if (total <= 0) return 0
  return Math.round((answered / total) * 1000) / 10
}

const recommendDialRatio = (answerRate: number, readyAgents: number, activeCalls: number) => {
  if (readyAgents <= 0) {
    return {
      recommendedRatio: 1,
      reason: 'No READY agents available. Keep ratio safe.',
      shouldAutoAdjust: false,
    }
  }

  const pressure = activeCalls / Math.max(readyAgents, 1)

  if (pressure >= 3) {
    return {
      recommendedRatio: 1,
      reason: 'Active-call pressure is high. Reduce dialing pressure.',
      shouldAutoAdjust: true,
    }
  }

  if (answerRate >= 55) {
    return {
      recommendedRatio: 1,
      reason: 'High answer rate. Keep ratio conservative to avoid abandoned calls.',
      shouldAutoAdjust: true,
    }
  }

  if (answerRate >= 35) {
    return {
      recommendedRatio: 2,
      reason: 'Healthy answer rate. Moderate progressive/predictive pacing is safe.',
      shouldAutoAdjust: true,
    }
  }

  if (answerRate >= 20) {
    return {
      recommendedRatio: 3,
      reason: 'Lower answer rate. Increase pacing carefully while monitoring abandoned calls.',
      shouldAutoAdjust: true,
    }
  }

  return {
    recommendedRatio: 4,
    reason: 'Low answer rate. Higher dialing ratio may be useful, but keep guardrails active.',
    shouldAutoAdjust: true,
  }
}

const buildHourlyHeatmap = (calls: Array<{ startedAt: Date; status: string; disposition: string | null }>) => {
  const slots = Array.from({ length: 24 }).map((_, offset) => {
    const date = new Date(Date.now() - (23 - offset) * 60 * 60 * 1000)
    return {
      hour: date.getHours(),
      label: `${String(date.getHours()).padStart(2, '0')}:00`,
      totalCalls: 0,
      answeredCalls: 0,
      completedCalls: 0,
      answerRate: 0,
      intensity: 0,
    }
  })

  calls.forEach(call => {
    const hour = call.startedAt.getHours()
    const slot = slots.find(item => item.hour === hour)
    if (!slot) return

    slot.totalCalls += 1
    if (call.disposition === 'ANSWERED' || call.status === 'ANSWERED') slot.answeredCalls += 1
    if (call.status === 'COMPLETED') slot.completedCalls += 1
  })

  const maxCalls = Math.max(1, ...slots.map(slot => slot.totalCalls))

  return slots.map(slot => ({
    ...slot,
    answerRate: calculateAnswerRate(slot.answeredCalls, slot.totalCalls),
    intensity: Math.round((slot.totalCalls / maxCalls) * 100),
  }))
}

export const getLiveMonitoringAdvancedViews = async (campaignId?: number, actor?: Scope.ScopeActor) => {
  const safeCampaignId = campaignId && Number.isFinite(campaignId) ? Number(campaignId) : undefined
  const campaignFilter: Prisma.CallWhereInput = safeCampaignId ? { campaignId: safeCampaignId } : {}
  const callScope = await Scope.callScopeWhere(actor)
  const userScope = await Scope.userScopeWhere(actor)
  const last24Hours = getSinceDate(24)

  const liveCalls = await prisma.call.findMany({
    where: {
      ...callScope,
      ...campaignFilter,
      status: { in: [...ACTIVE_CALL_STATUSES] as never },
    },
    select: {
      id: true,
      status: true,
      disposition: true,
      duration: true,
      startedAt: true,
      connectedAt: true,
      remoteNumber: true,
      source: true,
      campaign: { select: { id: true, name: true, mode: true, dialingRatio: true } },
      contact: { select: { id: true, name: true, phone: true, company: true, status: true } },
      agent: { select: { id: true, name: true, email: true, agentCode: true, extension: true, status: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 200,
  })

  const recentCalls = await prisma.call.findMany({
    where: {
      ...callScope,
      ...campaignFilter,
      startedAt: { gte: last24Hours },
    },
    select: {
      id: true,
      status: true,
      disposition: true,
      startedAt: true,
      endedAt: true,
      duration: true,
      campaignId: true,
      agentId: true,
    },
    orderBy: { startedAt: 'asc' },
    take: 2000,
  })

  const agents = await prisma.user.findMany({
    where: {
      ...userScope,
      role: 'AGENT',
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      agentCode: true,
      extension: true,
      status: true,
      updatedAt: true,
      sessions: {
        where: { disconnectedAt: null },
        select: { id: true, status: true, connectedAt: true, socketId: true },
        take: 3,
        orderBy: { connectedAt: 'desc' },
      },
      calls: {
        where: {
          ...callScope,
          startedAt: { gte: last24Hours },
        },
        select: {
          id: true,
          status: true,
          disposition: true,
          startedAt: true,
          duration: true,
        },
        orderBy: { startedAt: 'desc' },
        take: 50,
      },
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  })

  const statusCounts = ACTIVE_CALL_STATUSES.reduce<Record<string, number>>((acc, status) => {
    acc[status] = liveCalls.filter(call => call.status === status).length
    return acc
  }, {})

  const answeredRecent = recentCalls.filter(call => call.disposition === 'ANSWERED' || call.status === 'ANSWERED').length
  const answerRate24h = calculateAnswerRate(answeredRecent, recentCalls.length)
  const readyAgents = agents.filter(agent => agent.status === 'READY').length
  const busyAgents = agents.filter(agent => agent.status === 'BUSY').length
  const onlineAgents = agents.filter(agent => AGENT_LIVE_STATUSES.includes(agent.status as never)).length
  const activeCalls = liveCalls.length
  const ratioRecommendation = recommendDialRatio(answerRate24h, readyAgents, activeCalls)

  const mapBuckets = liveCalls.reduce<Record<string, {
    key: string
    label: string
    lat: number
    lng: number
    activeCalls: number
    ringingCalls: number
    answeredCalls: number
    numbers: string[]
  }>>((acc, call) => {
    const region = detectRegion(call.remoteNumber || call.contact?.phone)
    if (!acc[region.key]) {
      acc[region.key] = {
        key: region.key,
        label: region.label,
        lat: region.lat,
        lng: region.lng,
        activeCalls: 0,
        ringingCalls: 0,
        answeredCalls: 0,
        numbers: [],
      }
    }

    acc[region.key].activeCalls += 1
    if (call.status === 'RINGING') acc[region.key].ringingCalls += 1
    if (call.status === 'ANSWERED') acc[region.key].answeredCalls += 1
    if (call.remoteNumber) acc[region.key].numbers.push(call.remoteNumber)
    return acc
  }, {})

  const liveAgentActivity = agents.map(agent => {
    const todaysCalls = agent.calls.length
    const answeredCalls = agent.calls.filter(call => call.disposition === 'ANSWERED' || call.status === 'ANSWERED').length
    const activeAgentCalls = liveCalls.filter(call => call.agent?.id === agent.id)
    const totalDuration = agent.calls.reduce((sum, call) => sum + (call.duration || 0), 0)

    return {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      agentCode: agent.agentCode,
      extension: agent.extension,
      status: agent.status,
      isLive: agent.sessions.length > 0,
      activeSessions: agent.sessions.length,
      activeCalls: activeAgentCalls.length,
      todaysCalls,
      answeredCalls,
      answerRate: calculateAnswerRate(answeredCalls, todaysCalls),
      averageDurationSeconds: todaysCalls > 0 ? Math.round(totalDuration / todaysCalls) : 0,
      lastSeenAt: agent.updatedAt,
      lastCallAt: agent.calls[0]?.startedAt || null,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    campaignId: safeCampaignId || null,
    liveCallWall: liveCalls.map(call => ({
      id: call.id,
      status: call.status,
      disposition: call.disposition,
      duration: call.duration,
      startedAt: call.startedAt,
      connectedAt: call.connectedAt,
      remoteNumber: call.remoteNumber || call.contact?.phone,
      source: call.source,
      campaign: call.campaign,
      contact: call.contact,
      agent: call.agent,
      region: detectRegion(call.remoteNumber || call.contact?.phone),
    })),
    liveCallMap: Object.values(mapBuckets).map(bucket => ({
      ...bucket,
      sampleNumbers: bucket.numbers.slice(0, 5),
      numbers: undefined,
    })),
    hourlyHeatmap: buildHourlyHeatmap(recentCalls),
    liveAgentActivity,
    simultaneousCalls: {
      totalActive: activeCalls,
      initiated: statusCounts.INITIATED || 0,
      ringing: statusCounts.RINGING || 0,
      answered: statusCounts.ANSWERED || 0,
    },
    answerRateTracker: {
      window: '24h',
      totalCalls: recentCalls.length,
      answeredCalls: answeredRecent,
      answerRate: answerRate24h,
      readyAgents,
      busyAgents,
      onlineAgents,
      ...ratioRecommendation,
    },
    notes: [
      'Map buckets are inferred from phone-number prefixes until a dedicated contact location/geocoding field is added.',
      'Auto dial-ratio adjustment is advisory-only here; the actual campaign ratio must still be applied through campaign settings/engine guardrails.',
    ],
  }
}
