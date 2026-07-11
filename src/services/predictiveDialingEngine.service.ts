import prisma from '../lib/prisma'
import { calculatePredictivePacingV2 } from './predictivePacingV2.service'
import { isCampaignRuntimeAllowed } from './campaignRuntime.service'
import { normalizeDialingMode, DIALING_MODES } from '../constants/dialingModes'
import { getCampaignHopperSnapshot } from './contactDialingPolicy.service'

export type PredictiveEngineSnapshot = {
  campaignId: number
  generatedAt: string
  running: boolean
  campaignStatus: string | null
  mode: string
  runtimeAllowed: boolean
  waitingReason: string | null
  readyAgents: number
  agentStates: Record<string, number>
  activeCalls: number
  callStates: Record<string, number>
  pendingContacts: number
  retryDueContacts: number
  hopper: Awaited<ReturnType<typeof getCampaignHopperSnapshot>>
  answeredCalls: number
  totalCalls: number
  answerRate: number
  abandonRate: number
  averages: {
    ringSeconds: number
    talkSeconds: number
    wrapUpSeconds: number
  }
  settings: {
    predictiveEnabled: boolean
    adaptiveDialEnabled: boolean
    autoDialLevel: number
    maximumAbandonRate: number
    maximumSimultaneousCalls: number
    maximumCallsPerAgent: number
    minimumHopper: number
    maximumHopper: number
    wrapUpTime: number
    ringTimeout: number
    callTimeout: number
  }
  recommendedDialCount: number
  availableDialSlots: number
  guardrails: {
    safe: boolean
    reasons: string[]
  }
  pacing: ReturnType<typeof calculatePredictivePacingV2>
}

const ACTIVE_CALL_STATUSES = ['INITIATED', 'RINGING', 'ANSWERED']
const RETRY_DUE_STATUSES = ['NO_ANSWER', 'BUSY', 'FAILED']

export const getCampaignAnswerRate = async (campaignId: number) => {
  const totalCalls = await prisma.call.count({ where: { campaignId } })
  const answeredCalls = await prisma.call.count({
    where: {
      campaignId,
      OR: [
        { status: 'ANSWERED' as never },
        { disposition: 'ANSWERED' as never },
      ],
    },
  })

  return {
    totalCalls,
    answeredCalls,
    answerRate: totalCalls > 0 ? answeredCalls / totalCalls : 0.2,
  }
}

const countBy = <T extends string | null>(rows: { key: T; count: number }[]) => rows.reduce<Record<string, number>>((acc, row) => {
  acc[String(row.key || 'UNKNOWN')] = row.count
  return acc
}, {})

export const getPredictiveEngineSnapshot = async (campaignId: number, running = false): Promise<PredictiveEngineSnapshot> => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) {
    return {
      campaignId,
      generatedAt: new Date().toISOString(),
      running,
      campaignStatus: null,
      mode: DIALING_MODES.PROGRESSIVE,
      runtimeAllowed: false,
      waitingReason: 'CAMPAIGN_NOT_FOUND',
      readyAgents: 0,
      agentStates: {},
      activeCalls: 0,
      callStates: {},
      pendingContacts: 0,
      retryDueContacts: 0,
      hopper: { minimumHopper: 0, maximumHopper: 0, eligibleInHopper: 0, inspected: 0, dncBlocked: 0, needsRefill: true, empty: true },
      answeredCalls: 0,
      totalCalls: 0,
      answerRate: 0,
      abandonRate: 0,
      averages: { ringSeconds: 0, talkSeconds: 0, wrapUpSeconds: 0 },
      settings: {
        predictiveEnabled: false,
        adaptiveDialEnabled: false,
        autoDialLevel: 0,
        maximumAbandonRate: 0.03,
        maximumSimultaneousCalls: 0,
        maximumCallsPerAgent: 1,
        minimumHopper: 0,
        maximumHopper: 0,
        wrapUpTime: 0,
        ringTimeout: 0,
        callTimeout: 0,
      },
      recommendedDialCount: 0,
      availableDialSlots: 0,
      guardrails: { safe: false, reasons: ['CAMPAIGN_NOT_FOUND'] },
      pacing: calculatePredictivePacingV2({ readyAgents: 0, answerRate: 0.2 }),
    }
  }

  const mode = normalizeDialingMode(campaign.mode)
  const runtime = isCampaignRuntimeAllowed(campaign)

  const [agentGroups, callGroups, activeCalls, pendingContacts, retryDueRows, hopper, rates, durationStats] = await Promise.all([
    prisma.user.groupBy({ by: ['status'], where: { isActive: true }, _count: { _all: true } }),
    prisma.call.groupBy({ by: ['status'], where: { campaignId }, _count: { _all: true } }),
    prisma.call.count({ where: { campaignId, status: { in: ACTIVE_CALL_STATUSES as never } } }),
    prisma.contact.count({ where: { campaignId, status: 'PENDING' as never } }),
    prisma.contact.findMany({
      where: {
        campaignId,
        status: { in: RETRY_DUE_STATUSES as never },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      select: { retryCount: true, maxRetries: true },
    }),
    getCampaignHopperSnapshot(campaignId, campaign.minimumHopper, campaign.maximumHopper),
    getCampaignAnswerRate(campaignId),
    prisma.call.aggregate({
      where: { campaignId, duration: { not: null } },
      _avg: { duration: true },
    }),
  ])

  const agentStates = countBy(agentGroups.map(row => ({ key: row.status, count: row._count._all })))
  const callStates = countBy(callGroups.map(row => ({ key: row.status, count: row._count._all })))
  const readyAgents = agentStates.READY || 0
  const retryDueContacts = retryDueRows.filter(contact => contact.retryCount < contact.maxRetries).length

  const failedOrMissed = (callStates.NO_ANSWER || 0) + (callStates.FAILED || 0)
  const abandonRate = rates.totalCalls > 0 ? failedOrMissed / rates.totalCalls : 0
  const pacing = calculatePredictivePacingV2({
    readyAgents,
    answerRate: rates.answerRate || 0.2,
    activeCalls,
    abandonRate,
    autoDialLevel: mode === DIALING_MODES.PREDICTIVE ? campaign.autoDialLevel : 1,
    adaptiveDialEnabled: campaign.adaptiveDialEnabled,
    maxAbandonRate: campaign.maximumAbandonRate,
    maxSimultaneousCalls: campaign.maximumSimultaneousCalls,
    maxCallsPerReadyAgent: mode === DIALING_MODES.PREDICTIVE ? campaign.maximumCallsPerAgent : 1,
    safetyMultiplier: mode === DIALING_MODES.PREDICTIVE ? 0.85 : 1,
  })

  const recommendedDialCount = mode === DIALING_MODES.PROGRESSIVE
    ? readyAgents
    : mode === DIALING_MODES.PREDICTIVE
      ? pacing.recommendedDialCount
      : 0

  const availableDialSlots = Math.max(0, Math.min(pacing.availableDialSlots, campaign.maximumSimultaneousCalls - activeCalls))
  const guardrailReasons: string[] = []
  if (!runtime.allowed) guardrailReasons.push(runtime.reason || 'RUNTIME_BLOCKED')
  if (readyAgents <= 0) guardrailReasons.push('NO_READY_AGENTS')
  if (mode === DIALING_MODES.MANUAL || mode === DIALING_MODES.PREVIEW) guardrailReasons.push('MODE_NOT_AUTOMATED')
  if (pendingContacts + retryDueContacts <= 0) guardrailReasons.push('NO_ELIGIBLE_CONTACTS')
  if (mode === DIALING_MODES.PREDICTIVE && !campaign.predictiveEnabled) guardrailReasons.push('PREDICTIVE_DISABLED')
  if (campaign.emergencyStopped) guardrailReasons.push('EMERGENCY_STOP')
  if (abandonRate > campaign.maximumAbandonRate) guardrailReasons.push('ABANDON_RATE_EXCEEDED')
  if (hopper.empty) guardrailReasons.push('HOPPER_EMPTY')

  return {
    campaignId,
    generatedAt: new Date().toISOString(),
    running,
    campaignStatus: campaign.status,
    mode,
    runtimeAllowed: runtime.allowed,
    waitingReason: runtime.allowed ? null : runtime.reason || null,
    readyAgents,
    agentStates,
    activeCalls,
    callStates,
    pendingContacts,
    retryDueContacts,
    hopper,
    answeredCalls: rates.answeredCalls,
    totalCalls: rates.totalCalls,
    answerRate: rates.answerRate,
    abandonRate,
    averages: {
      ringSeconds: Math.min(campaign.ringTimeout, Math.round(durationStats._avg.duration || 0)),
      talkSeconds: Math.round(durationStats._avg.duration || 0),
      wrapUpSeconds: campaign.wrapUpTime,
    },
    settings: {
      predictiveEnabled: campaign.predictiveEnabled,
      adaptiveDialEnabled: campaign.adaptiveDialEnabled,
      autoDialLevel: campaign.autoDialLevel,
      maximumAbandonRate: campaign.maximumAbandonRate,
      maximumSimultaneousCalls: campaign.maximumSimultaneousCalls,
      maximumCallsPerAgent: campaign.maximumCallsPerAgent,
      minimumHopper: campaign.minimumHopper,
      maximumHopper: campaign.maximumHopper,
      wrapUpTime: campaign.wrapUpTime,
      ringTimeout: campaign.ringTimeout,
      callTimeout: campaign.callTimeout,
    },
    recommendedDialCount,
    availableDialSlots,
    guardrails: {
      safe: guardrailReasons.length === 0,
      reasons: guardrailReasons,
    },
    pacing,
  }
}
