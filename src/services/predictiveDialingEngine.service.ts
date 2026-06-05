import prisma from '../lib/prisma'
import { calculatePredictivePacingV2 } from './predictivePacingV2.service'
import { isCampaignRuntimeAllowed } from './campaignRuntime.service'
import { normalizeDialingMode, DIALING_MODES } from '../constants/dialingModes'

export type PredictiveEngineSnapshot = {
  campaignId: number
  generatedAt: string
  running: boolean
  campaignStatus: string | null
  mode: string
  runtimeAllowed: boolean
  waitingReason: string | null
  readyAgents: number
  activeCalls: number
  pendingContacts: number
  retryDueContacts: number
  answeredCalls: number
  totalCalls: number
  answerRate: number
  recommendedDialCount: number
  availableDialSlots: number
  guardrails: {
    safe: boolean
    reasons: string[]
  }
  pacing: ReturnType<typeof calculatePredictivePacingV2>
}

const ACTIVE_CALL_STATUSES = ['INITIATED', 'RINGING', 'ANSWERED']
const RETRY_DUE_STATUSES = ['NO_ANSWER', 'BUSY', 'FAILED', 'VOICEMAIL']

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
      activeCalls: 0,
      pendingContacts: 0,
      retryDueContacts: 0,
      answeredCalls: 0,
      totalCalls: 0,
      answerRate: 0,
      recommendedDialCount: 0,
      availableDialSlots: 0,
      guardrails: { safe: false, reasons: ['CAMPAIGN_NOT_FOUND'] },
      pacing: calculatePredictivePacingV2({ readyAgents: 0, answerRate: 0.2 }),
    }
  }

  const mode = normalizeDialingMode(campaign.mode)
  const runtime = isCampaignRuntimeAllowed(campaign)

  const readyAgents = await prisma.user.count({ where: { status: 'READY', isActive: true } })
  const activeCalls = await prisma.call.count({
    where: { campaignId, status: { in: ACTIVE_CALL_STATUSES as never } },
  })
  const pendingContacts = await prisma.contact.count({
    where: { campaignId, status: 'PENDING' as never },
  })
  const retryDueRows = await prisma.contact.findMany({
    where: {
      campaignId,
      status: { in: RETRY_DUE_STATUSES as never },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    select: { retryCount: true, maxRetries: true },
  })
  const retryDueContacts = retryDueRows.filter(contact => contact.retryCount < contact.maxRetries).length

  const rates = await getCampaignAnswerRate(campaignId)
  const pacing = calculatePredictivePacingV2({
    readyAgents,
    answerRate: rates.answerRate || 0.2,
    maxCallsPerReadyAgent: mode === DIALING_MODES.PREDICTIVE ? campaign.dialingRatio : 1,
    safetyMultiplier: mode === DIALING_MODES.PREDICTIVE ? 0.85 : 1,
  })

  const recommendedDialCount = mode === DIALING_MODES.PROGRESSIVE
    ? readyAgents
    : mode === DIALING_MODES.PREDICTIVE
      ? pacing.recommendedDialCount
      : 0

  const availableDialSlots = Math.max(0, recommendedDialCount - activeCalls)
  const guardrailReasons: string[] = []
  if (!runtime.allowed) guardrailReasons.push(runtime.reason || 'RUNTIME_BLOCKED')
  if (readyAgents <= 0) guardrailReasons.push('NO_READY_AGENTS')
  if (mode === DIALING_MODES.MANUAL || mode === DIALING_MODES.PREVIEW) guardrailReasons.push('MODE_NOT_AUTOMATED')
  if (pendingContacts + retryDueContacts <= 0) guardrailReasons.push('NO_ELIGIBLE_CONTACTS')

  return {
    campaignId,
    generatedAt: new Date().toISOString(),
    running,
    campaignStatus: campaign.status,
    mode,
    runtimeAllowed: runtime.allowed,
    waitingReason: runtime.allowed ? null : runtime.reason || null,
    readyAgents,
    activeCalls,
    pendingContacts,
    retryDueContacts,
    answeredCalls: rates.answeredCalls,
    totalCalls: rates.totalCalls,
    answerRate: rates.answerRate,
    recommendedDialCount,
    availableDialSlots,
    guardrails: {
      safe: guardrailReasons.length === 0,
      reasons: guardrailReasons,
    },
    pacing,
  }
}
