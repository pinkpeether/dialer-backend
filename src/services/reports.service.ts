import prisma from '../lib/prisma'

export const getSummary = async (filters: {
  from?: Date
  to?: Date
  campaignId?: number
  agentId?: number
}) => {
  const { from, to, campaignId, agentId } = filters

  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId
  if (agentId)    where.agentId    = agentId
  if (from || to) {
    where.startedAt = {
      ...(from ? { gte: from } : {}),
      ...(to   ? { lte: to   } : {}),
    }
  }

  const [totalCalls, answered, noAnswer, voicemail, callback, dnc, wrongNumber, failed] =
    await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, disposition: 'ANSWERED'      } }),
      prisma.call.count({ where: { ...where, disposition: 'NO_ANSWER'     } }),
      prisma.call.count({ where: { ...where, disposition: 'VOICEMAIL'     } }),
      prisma.call.count({ where: { ...where, disposition: 'CALLBACK'      } }),
      prisma.call.count({ where: { ...where, disposition: 'DO_NOT_CALL'   } }),
      prisma.call.count({ where: { ...where, disposition: 'WRONG_NUMBER'  } }),
      prisma.call.count({ where: { ...where, status:      'FAILED'        } }),
    ])

  const totalDuration = await prisma.call.aggregate({
    _sum: { duration: true },
    where: { ...where, status: 'COMPLETED' },
  })

  const answerRate = totalCalls > 0
    ? Math.round((answered / totalCalls) * 100 * 10) / 10
    : 0

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
    answerRate,
  }
}

export const getCallTrend = async (filters: {
  from?: Date
  to?: Date
  granularity?: 'day' | 'week'
}) => {
  const { from, to } = filters

  // Use raw query for time-series bucketing — prisma doesn't natively support date_trunc in groupBy
  const rows = await prisma.$queryRaw<Array<{ date: string; total: bigint; answered: bigint }>>`
    SELECT
      DATE_TRUNC('day', "startedAt") AS date,
      COUNT(*)                        AS total,
      COUNT(*) FILTER (WHERE disposition = 'ANSWERED') AS answered
    FROM "Call"
    WHERE 1=1
      ${ from ? prisma.$queryRaw`AND "startedAt" >= ${from}` : prisma.$queryRaw`` }
      ${ to   ? prisma.$queryRaw`AND "startedAt" <= ${to}`   : prisma.$queryRaw`` }
    GROUP BY 1
    ORDER BY 1 ASC
  `

  return rows.map(r => ({
    date:     r.date,
    total:    Number(r.total),
    answered: Number(r.answered),
  }))
}

export const getCampaignBreakdown = async (filters: {
  from?: Date
  to?: Date
}) => {
  const { from, to } = filters

  const dateFilter: Record<string, unknown> = {}
  if (from || to) {
    dateFilter.startedAt = {
      ...(from ? { gte: from } : {}),
      ...(to   ? { lte: to   } : {}),
    }
  }

  const campaigns = await prisma.campaign.findMany({
    select: {
      id:     true,
      name:   true,
      status: true,
      _count: { select: { calls: true, contacts: true } },
      calls: {
        where: dateFilter,
        select: { status: true, disposition: true, duration: true },
      },
    },
  })

  return campaigns.map(c => {
    const total     = c.calls.length
    const answered  = c.calls.filter(x => x.disposition === 'ANSWERED').length
    const talkTime  = c.calls.reduce((a, x) => a + (x.duration ?? 0), 0)
    return {
      id:            c.id,
      name:          c.name,
      status:        c.status,
      totalContacts: c._count.contacts,
      totalCalls:    total,
      answered,
      answerRate:    total > 0 ? Math.round((answered / total) * 100 * 10) / 10 : 0,
      totalTalkTimeSecs: talkTime,
    }
  })
}

export const getAgentBreakdown = async (filters: {
  from?: Date
  to?: Date
}) => {
  const { from, to } = filters

  const dateFilter: Record<string, unknown> = {}
  if (from || to) {
    dateFilter.startedAt = {
      ...(from ? { gte: from } : {}),
      ...(to   ? { lte: to   } : {}),
    }
  }

  const agents = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id:        true,
      agentCode: true,
      name:      true,
      status:    true,
      calls: {
        where: dateFilter,
        select: { status: true, disposition: true, duration: true },
      },
    },
  })

  return agents.map(a => {
    const total    = a.calls.length
    const answered = a.calls.filter(x => x.disposition === 'ANSWERED').length
    const talkTime = a.calls.reduce((acc, x) => acc + (x.duration ?? 0), 0)
    return {
      id:            a.id,
      agentCode:     a.agentCode,
      name:          a.name,
      status:        a.status,
      totalCalls:    total,
      answered,
      answerRate:    total > 0 ? Math.round((answered / total) * 100 * 10) / 10 : 0,
      totalTalkTimeSecs: talkTime,
    }
  })
}
