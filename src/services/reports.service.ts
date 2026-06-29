import prisma from '../lib/prisma'
import { Prisma } from '@prisma/client'
import * as Scope from './commercialScope.service'

type Actor = Scope.ScopeActor

const scopedCallWhere = async (filters: {
  from?: Date
  to?: Date
  campaignId?: number
  agentId?: number
}, actor?: Actor): Promise<Prisma.CallWhereInput> => {
  const where: Prisma.CallWhereInput = await Scope.callScopeWhere(actor)

  if (filters.campaignId) where.campaignId = filters.campaignId
  if (filters.agentId) where.agentId = filters.agentId
  if (filters.from || filters.to) {
    where.startedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }

  return where
}

const scopedAccountSql = async (actor?: Actor) => {
  if (Scope.isPlatformActor(actor)) return Prisma.empty
  const accountIds = await Scope.getActorAccountIds(actor)
  if (!accountIds.length) return Prisma.sql`AND 1=0`
  return Prisma.sql`AND campaigns."commercialAccountId" IN (${Prisma.join(accountIds)})`
}

export const getSummary = async (filters: {
  from?: Date
  to?: Date
  campaignId?: number
  agentId?: number
}, actor?: Actor) => {
  const where = await scopedCallWhere(filters, actor)

  const [totalCalls, answered, noAnswer, voicemail, callback, dnc, wrongNumber, failed] =
    await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, disposition: 'ANSWERED' } }),
      prisma.call.count({ where: { ...where, disposition: 'NO_ANSWER' } }),
      prisma.call.count({ where: { ...where, disposition: 'VOICEMAIL' } }),
      prisma.call.count({ where: { ...where, disposition: 'CALLBACK' } }),
      prisma.call.count({ where: { ...where, disposition: 'DO_NOT_CALL' } }),
      prisma.call.count({ where: { ...where, disposition: 'WRONG_NUMBER' } }),
      prisma.call.count({ where: { ...where, status: 'FAILED' } }),
    ])

  const totalDuration = await prisma.call.aggregate({
    _sum: { duration: true },
    where: { ...where, status: 'COMPLETED' },
  })

  return {
    totalCalls,
    answered,
    noAnswer,
    voicemail,
    callback,
    dnc,
    wrongNumber,
    failed,
    totalTalkTimeSecs: totalDuration._sum.duration ?? 0,
    answerRate: totalCalls > 0 ? Math.round((answered / totalCalls) * 100 * 10) / 10 : 0,
  }
}

export const getCallTrend = async (filters: {
  from?: Date
  to?: Date
  granularity?: 'day' | 'week'
}, actor?: Actor) => {
  const bucket = filters.granularity === 'week'
    ? Prisma.sql`DATE_TRUNC('week', calls."startedAt")`
    : Prisma.sql`DATE_TRUNC('day', calls."startedAt")`
  const accountSql = await scopedAccountSql(actor)

  const rows = await prisma.$queryRaw<Array<{ date: Date; total: bigint; answered: bigint }>>(Prisma.sql`
    SELECT
      ${bucket} AS date,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE calls.disposition = 'ANSWERED') AS answered
    FROM "Call" calls
    JOIN "Campaign" campaigns ON campaigns.id = calls."campaignId"
    WHERE 1=1
      ${accountSql}
      ${filters.from ? Prisma.sql`AND calls."startedAt" >= ${filters.from}` : Prisma.empty}
      ${filters.to ? Prisma.sql`AND calls."startedAt" <= ${filters.to}` : Prisma.empty}
    GROUP BY 1
    ORDER BY 1 ASC
  `)

  return rows.map(row => ({
    date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
    total: Number(row.total),
    answered: Number(row.answered),
  }))
}

export const getCampaignBreakdown = async (filters: {
  from?: Date
  to?: Date
}, actor?: Actor) => {
  const dateFilter: Prisma.CallWhereInput = {}
  if (filters.from || filters.to) {
    dateFilter.startedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }

  const campaigns = await prisma.campaign.findMany({
    where: await Scope.campaignScopeWhere(actor),
    select: {
      id: true,
      name: true,
      status: true,
      _count: { select: { calls: true, contacts: true } },
      calls: {
        where: dateFilter,
        select: { status: true, disposition: true, duration: true },
      },
    },
  })

  return campaigns.map(campaign => {
    const total = campaign.calls.length
    const answered = campaign.calls.filter(call => call.disposition === 'ANSWERED').length
    const talkTime = campaign.calls.reduce((sum, call) => sum + (call.duration ?? 0), 0)
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      totalContacts: campaign._count.contacts,
      totalCalls: total,
      answered,
      answerRate: total > 0 ? Math.round((answered / total) * 100 * 10) / 10 : 0,
      totalTalkTimeSecs: talkTime,
    }
  })
}

export const getAgentBreakdown = async (filters: {
  from?: Date
  to?: Date
}, actor?: Actor) => {
  const userWhere = await Scope.userScopeWhere(actor)
  const callWhere = await scopedCallWhere({ from: filters.from, to: filters.to }, actor)

  const agents = await prisma.user.findMany({
    where: { isActive: true, role: 'AGENT', ...userWhere },
    select: {
      id: true,
      agentCode: true,
      name: true,
      status: true,
      calls: {
        where: callWhere,
        select: { status: true, disposition: true, duration: true },
      },
    },
  })

  return agents.map(agent => {
    const total = agent.calls.length
    const answered = agent.calls.filter(call => call.disposition === 'ANSWERED').length
    const talkTime = agent.calls.reduce((sum, call) => sum + (call.duration ?? 0), 0)
    return {
      id: agent.id,
      agentCode: agent.agentCode,
      name: agent.name,
      status: agent.status,
      totalCalls: total,
      answered,
      answerRate: total > 0 ? Math.round((answered / total) * 100 * 10) / 10 : 0,
      totalTalkTimeSecs: talkTime,
    }
  })
}
