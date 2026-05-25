import prisma from '../lib/prisma'

const todayRange = () => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 1)
  return { start, end }
}

const byKey = <T extends string | null>(rows: Array<{ [key: string]: unknown; _count: { _all: number } }>, key: string) => {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = row[key] as T
    if (value) acc[String(value)] = row._count._all
    return acc
  }, {})
}

export const getOpsSummary = async () => {
  const { start, end } = todayRange()
  const now = new Date()

  // Sequential by design: keeps Prisma safe with small connection pools.
  const campaignRows = await prisma.campaign.groupBy({ by: ['status'], _count: { _all: true } })
  const callRows = await prisma.call.groupBy({
    by: ['status'],
    where: { startedAt: { gte: start, lt: end } },
    _count: { _all: true },
  })
  const dispositionRows = await prisma.call.groupBy({
    by: ['disposition'],
    where: { startedAt: { gte: start, lt: end }, disposition: { not: null } },
    _count: { _all: true },
  })
  const dueOrOverdue = await prisma.callback.count({
    where: { status: { in: ['PENDING', 'RESCHEDULED'] }, scheduledAt: { lte: now } },
  })
  const upcoming = await prisma.callback.count({
    where: { status: { in: ['PENDING', 'RESCHEDULED'] }, scheduledAt: { gt: now } },
  })
  const lowContactCampaigns = await prisma.campaign.findMany({
    where: { status: 'ACTIVE' },
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
