import prisma from '../lib/prisma'
import { initiateCall } from './twilio.service'
import logger from '../utils/logger'
import { AppError } from '../middleware/errorHandler'

// Active campaigns tracker
const activeCampaigns = new Map<number, NodeJS.Timeout>()

export const startCampaign = async (campaignId: number) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId }
  })
  if (!campaign) throw new AppError('Campaign not found', 404)
  if (campaign.status !== 'ACTIVE') {
    throw new AppError('Campaign must be ACTIVE to start dialing', 400)
  }
  if (activeCampaigns.has(campaignId)) {
    throw new AppError('Campaign is already running', 400)
  }

  logger.info(`🚀 Starting campaign: ${campaign.name}`)
  await dialNext(campaignId)
}

export const stopCampaign = async (campaignId: number) => {
  const timer = activeCampaigns.get(campaignId)
  if (timer) {
    clearTimeout(timer)
    activeCampaigns.delete(campaignId)
  }
  logger.info(`⛔ Campaign ${campaignId} stopped`)
}

const dialNext = async (campaignId: number) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    })
    if (!campaign || campaign.status !== 'ACTIVE') {
      activeCampaigns.delete(campaignId)
      return
    }

    // Get available agents
    const availableAgents = await prisma.user.findMany({
      where: { status: 'READY', isActive: true },
      select: { id: true }
    })

    if (availableAgents.length === 0) {
      logger.info(`⏳ No agents available — waiting 5s`)
      const timer = setTimeout(() => dialNext(campaignId), 5000)
      activeCampaigns.set(campaignId, timer)
      return
    }

    // Calculate simultaneous dials
    const simultaneousDials = availableAgents.length * campaign.dialingRatio

    // Get pending contacts
    const pendingContacts = await prisma.contact.findMany({
      where: {
        campaignId,
        status: 'PENDING',
      },
      take:    simultaneousDials,
      orderBy: { createdAt: 'asc' },
    })

    if (pendingContacts.length === 0) {
      logger.info(`✅ Campaign ${campaignId} — all contacts dialed!`)
      await prisma.campaign.update({
        where: { id: campaignId },
        data:  { status: 'COMPLETED' }
      })
      activeCampaigns.delete(campaignId)
      return
    }

    // Dial all pending contacts simultaneously
    logger.info(`📞 Dialing ${pendingContacts.length} numbers for campaign ${campaignId}`)

    await Promise.allSettled(
      pendingContacts.map(contact =>
        initiateCall(contact.id, campaignId)
      )
    )

    // Schedule next batch after 10 seconds
    const timer = setTimeout(() => dialNext(campaignId), 10000)
    activeCampaigns.set(campaignId, timer)

  } catch (err) {
    logger.error(`Dialer error for campaign ${campaignId}: ${err}`)
    const timer = setTimeout(() => dialNext(campaignId), 15000)
    activeCampaigns.set(campaignId, timer)
  }
}

export const getActiveCampaigns = (): number[] => {
  return Array.from(activeCampaigns.keys())
}

export const routeCallToAgent = async (
  callId: number
): Promise<number | null> => {
  // Find first available READY agent
  const agent = await prisma.user.findFirst({
    where:   { status: 'READY', isActive: true },
    orderBy: { updatedAt: 'asc' }, // longest waiting agent first
  })

  if (!agent) return null

  // Mark agent as BUSY
  await prisma.user.update({
    where: { id: agent.id },
    data:  { status: 'BUSY' }
  })

  // Update call with agent
  await prisma.call.update({
    where: { id: callId },
    data:  { agentId: agent.id, connectedAt: new Date() }
  })

  logger.info(`🔗 Call ${callId} routed to agent ${agent.id}`)
  return agent.id
}