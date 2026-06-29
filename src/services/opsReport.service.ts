import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import * as Scope from './commercialScope.service'

type Actor = Scope.ScopeActor

const todayRange = () => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 1)
  return { start, end }
}

const byKey = <T extends string | null>(rows: Array<{ [key: string]: unknown; _count: { _all: number } }>, key: string) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    const value = row[key] as T
    if (value) acc[String(value)] = row._count._all
    return acc
  }, {})

const callbackScopeWhere = async (actor?: Actor): Promise<Prisma.CallbackWhereInput> => {
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

export const getOpsSummary = async (actor?: Actor) => {
  const { start, end } = todayRange()
  const now = new Date()
  const campaignWhere = await Scope.campaignScopeWhere(actor)
  const callWhere = await Scope.callScopeWhere(actor)
  const callbackWhere = await callbackScopeWhere(actor)

  const campaignRows = await prisma.campaign.groupBy({ by: ['status'], where: campaignWhere, _count: { _all: true } })
  const callRows = await prisma.call.groupBy({
    by: ['status'],
    where: { ...callWhere, startedAt: { gte: start, lt: end } },
    _count: { _all: true },
  })
  const dispositionRows = await prisma.call.groupBy({
    by: ['disposition'],
    where: { ...callWhere, startedAt: { gte: start, lt: end }, disposition: { not: null } },
    _count: { _all: true },
  })
  const dueOrOverdue = await prisma.callback.count({
    where: { ...callbackWhere, status: { in: ['PENDING', 'RESCHEDULED'] }, scheduledAt: { lte: now } },
  })
  const upcoming = await prisma.callback.count({
    where: { ...callbackWhere, status: { in: ['PENDING', 'RESCHEDULED'] }, scheduledAt: { gt: now } },
  })
  const lowContactCampaigns = await prisma.campaign.findMany({
    where: { ...campaignWhere, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      _count: { select: { contacts: { where: { status: 'PENDING' } } } },
    },
    take: 50,
  })

  const campaigns = byKey(campaignRows, 'status')
  const calls = byKey(callRows, 'status')
  const dispositions = byKey(dispositionRows, 'disposition')

  return {
    generatedAt: now.toISOString(),
    campaigns: {
      total: Object.values(campaigns).reduce((a, b) => a + b, 0),
      draft: campaigns.DRAFT ?? 0,
      active: campaigns.ACTIVE ?? 0,
      paused: campaigns.PAUSED ?? 0,
      completed: campaigns.COMPLETED ?? 0,
    },
    todayCalls: {
      total: Object.values(calls).reduce((a, b) => a + b, 0),
      byStatus: calls,
      byDisposition: dispositions,
    },
    callbacks: { dueOrOverdue, upcoming },
    lowContactCampaigns: lowContactCampaigns
      .map(c => ({ id: c.id, name: c.name, pendingContacts: c._count.contacts }))
      .filter(c => c.pendingContacts <= 25),
  }
}
