import prisma from '../lib/prisma'
import { initiateCall } from './twilio.service'
import logger from '../utils/logger'
import { AppError } from '../middleware/errorHandler'
import { isCampaignRuntimeAllowed } from './campaignRuntime.service'
import { normalizeDialingMode, DIALING_MODES } from '../constants/dialingModes'
import { getEligibleCampaignContacts } from './contactDialingPolicy.service'
import { getPredictiveEngineSnapshot } from './predictiveDialingEngine.service'

const activeCampaigns = new Map<number, NodeJS.Timeout>()
const DEFAULT_TICK_MS = 10_000
const WAIT_TICK_MS = 5_000
const ERROR_TICK_MS = 15_000

const scheduleNextTick = (campaignId: number, delayMs = DEFAULT_TICK_MS) => {
  const existing = activeCampaigns.get(campaignId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => void dialNext(campaignId), delayMs)
  activeCampaigns.set(campaignId, timer)
}

export const startCampaign = async (campaignId: number) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)
  if (campaign.status !== 'ACTIVE') throw new AppError('Campaign must be ACTIVE to start dialing', 400)

  const mode = normalizeDialingMode(campaign.mode)
  if (mode === DIALING_MODES.MANUAL || mode === DIALING_MODES.PREVIEW) {
    throw new AppError(`${mode} campaigns cannot be started by the automated engine`, 400)
  }

  if (activeCampaigns.has(campaignId)) throw new AppError('Campaign is already running', 400)

  logger.info(`🚀 Starting ${mode} campaign engine: ${campaign.name}`)
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { waitingReason: null, lastSchedulerCheckAt: new Date() },
  })
  await dialNext(campaignId)
}

export const stopCampaign = async (campaignId: number) => {
  const timer = activeCampaigns.get(campaignId)
  if (timer) clearTimeout(timer)
  activeCampaigns.delete(campaignId)
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { waitingReason: 'STOPPED_BY_OPERATOR', lastSchedulerCheckAt: new Date() },
  }).catch(() => undefined)
  logger.info(`⛔ Campaign ${campaignId} stopped`)
}

const completeIfExhausted = async (campaignId: number) => {
  const remainingRows = await prisma.contact.findMany({
    where: {
      campaignId,
      status: { in: ['PENDING', 'NO_ANSWER', 'BUSY', 'FAILED', 'VOICEMAIL'] as never },
    },
    select: { retryCount: true, maxRetries: true },
  })
  const remaining = remainingRows.filter(contact => contact.retryCount < contact.maxRetries).length

  if (remaining > 0) return false

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'COMPLETED', waitingReason: 'ALL_CONTACTS_EXHAUSTED', lastSchedulerCheckAt: new Date() },
  })
  activeCampaigns.delete(campaignId)
  logger.info(`✅ Campaign ${campaignId} completed — all contacts exhausted`)
  return true
}

export const dialNext = async (campaignId: number) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
    if (!campaign || campaign.status !== 'ACTIVE') {
      activeCampaigns.delete(campaignId)
      return
    }

    const mode = normalizeDialingMode(campaign.mode)
    const runtime = isCampaignRuntimeAllowed(campaign)
    if (!runtime.allowed) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { waitingReason: runtime.reason || 'RUNTIME_BLOCKED', lastSchedulerCheckAt: new Date() },
      })
      scheduleNextTick(campaignId, WAIT_TICK_MS)
      return
    }

    const snapshot = await getPredictiveEngineSnapshot(campaignId, activeCampaigns.has(campaignId))
    if (snapshot.guardrails.reasons.includes('NO_READY_AGENTS')) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { waitingReason: 'NO_READY_AGENTS', lastSchedulerCheckAt: new Date() },
      })
      scheduleNextTick(campaignId, WAIT_TICK_MS)
      return
    }

    const availableSlots = snapshot.availableDialSlots
    if (availableSlots <= 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { waitingReason: 'ACTIVE_CALL_CAP_REACHED', lastSchedulerCheckAt: new Date() },
      })
      scheduleNextTick(campaignId, WAIT_TICK_MS)
      return
    }

    const batch = await getEligibleCampaignContacts(campaignId, availableSlots)
    if (batch.contacts.length === 0) {
      const completed = await completeIfExhausted(campaignId)
      if (!completed) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { waitingReason: 'WAITING_FOR_RETRY_WINDOW', lastSchedulerCheckAt: new Date() },
        })
        scheduleNextTick(campaignId, DEFAULT_TICK_MS)
      }
      return
    }

    await prisma.contact.updateMany({
      where: { id: { in: batch.contacts.map(contact => contact.id) } },
      data: { status: 'IN_QUEUE', updatedAt: new Date() },
    })

    logger.info(`📞 ${mode} engine dialing ${batch.contacts.length}/${availableSlots} contacts for campaign ${campaignId}`)

    const results = await Promise.allSettled(
      batch.contacts.map(contact => initiateCall(contact.id, campaignId))
    )

    const failedContactIds = batch.contacts
      .filter((_, index) => results[index].status === 'rejected')
      .map(contact => contact.id)

    if (failedContactIds.length > 0) {
      await prisma.contact.updateMany({
        where: { id: { in: failedContactIds } },
        data: {
          status: 'FAILED',
          retryCount: { increment: 1 },
          nextRetryAt: new Date(Date.now() + Math.max(30, campaign.retryDelay) * 1000),
          lastDisposition: 'FAILED_TO_DIAL',
          updatedAt: new Date(),
        },
      })
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { waitingReason: null, lastSchedulerCheckAt: new Date() },
    })

    scheduleNextTick(campaignId, mode === DIALING_MODES.PREDICTIVE ? 7_500 : DEFAULT_TICK_MS)
  } catch (err) {
    logger.error(`Dialer error for campaign ${campaignId}: ${err}`)
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { waitingReason: 'ENGINE_ERROR', lastSchedulerCheckAt: new Date() },
    }).catch(() => undefined)
    scheduleNextTick(campaignId, ERROR_TICK_MS)
  }
}

export const getActiveCampaigns = (): number[] => Array.from(activeCampaigns.keys())

export const getCampaignEngineStatus = async (campaignId: number) => {
  return getPredictiveEngineSnapshot(campaignId, activeCampaigns.has(campaignId))
}

export const runCampaignEngineTick = async (campaignId: number) => {
  await dialNext(campaignId)
  return getCampaignEngineStatus(campaignId)
}

export const routeCallToAgent = async (callId: number): Promise<number | null> => {
  const agent = await prisma.user.findFirst({
    where: { status: 'READY', isActive: true },
    orderBy: { updatedAt: 'asc' },
  })

  if (!agent) return null

  await prisma.user.update({ where: { id: agent.id }, data: { status: 'BUSY' } })
  await prisma.call.update({ where: { id: callId }, data: { agentId: agent.id, connectedAt: new Date() } })

  logger.info(`🔗 Call ${callId} routed to agent ${agent.id}`)
  return agent.id
}
