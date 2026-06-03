import prisma from '../lib/prisma'

export const getDialingMetrics = async (campaignId?: number) => {
  const where = campaignId ? { campaignId } : {}

  const totalCalls = await prisma.call.count({ where })
  const completedCalls = await prisma.call.count({ where: { ...where, status: 'COMPLETED' } })
  const answeredCalls = await prisma.call.count({ where: { ...where, disposition: 'ANSWERED' } })
  const callbackCalls = await prisma.call.count({ where: { ...where, disposition: 'CALLBACK' } })
  const dncCalls = await prisma.call.count({ where: { ...where, disposition: 'DO_NOT_CALL' } })

  const recentCalls = await prisma.call.findMany({
    where,
    select: {
      id: true,
      campaignId: true,
      agentId: true,
      status: true,
      disposition: true,
      duration: true,
      startedAt: true,
      endedAt: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 200,
  })

  const answerRate = totalCalls > 0 ? answeredCalls / totalCalls : 0
  const callbackRate = totalCalls > 0 ? callbackCalls / totalCalls : 0

  return {
    generatedAt: new Date().toISOString(),
    campaignId: campaignId || null,
    totals: {
      totalCalls,
      completedCalls,
      answeredCalls,
      callbackCalls,
      dncCalls,
    },
    rates: {
      answerRate,
      callbackRate,
    },
    recentCalls,
    note: 'Baseline metrics only. Predictive v2 must remain feature-flagged until live data is reviewed.',
  }
}
