import prisma from '../lib/prisma'
import { queueManager } from './queueManager'
import { getCallProvider } from '../providers/callProviderFactory'
import { isCampaignRuntimeAllowed } from './campaignRuntime.service'
import { calculateDialSlots } from './predictivePacing.service'

const SCHEDULER_INTERVAL_MS = 3000
let schedulerRunning = false

async function countActiveOutboundCalls(campaignId: number) {
  return prisma.call.count({
    where: {
      campaignId,
      direction: 'outgoing',
      status: { in: ['INITIATED', 'RINGING', 'ANSWERED'] },
    },
  })
}

async function runSchedulerTick(): Promise<void> {
  const campaigns = await prisma.campaign.findMany({ where: { status: 'ACTIVE' } })
  if (campaigns.length === 0) return

  let provider
  try {
    provider = getCallProvider()
  } catch {
    return
  }

  for (const campaign of campaigns) {
    const runtime = isCampaignRuntimeAllowed(campaign)

    if (!runtime.allowed) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          waitingReason: runtime.reason || 'NOT_DIALABLE',
          lastSchedulerCheckAt: new Date(),
        },
      })
      continue
    }

    await queueManager.refreshQueueIfEmpty(campaign.id)

    const readyAgents = await prisma.user.count({
      where: { status: 'READY', isActive: true },
    })

    const activeOutboundCalls = await countActiveOutboundCalls(campaign.id)

    const pacing = calculateDialSlots({
      mode: campaign.mode,
      readyAgents,
      activeOutboundCalls,
      dialingRatio: campaign.dialingRatio,
      queueSize: queueManager.size(campaign.id),
    })

    if (pacing.slots <= 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          waitingReason: pacing.reason || null,
          lastSchedulerCheckAt: new Date(),
        },
      })

      const hasRemainingWork = await queueManager.campaignHasRemainingWork(campaign.id)
      if (!hasRemainingWork) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'COMPLETED', waitingReason: null },
        })
        await queueManager.clear(campaign.id)
      }

      continue
    }

    if (campaign.waitingReason) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          waitingReason: null,
          lastSchedulerCheckAt: new Date(),
        },
      })
    }

    for (let i = 0; i < pacing.slots; i++) {
      const queued = queueManager.dequeue(campaign.id)
      if (!queued) break

      const call = await prisma.call.create({
        data: {
          contactId: queued.id,
          campaignId: campaign.id,
          status: 'INITIATED',
          direction: 'outgoing',
          remoteNumber: queued.phone,
          source: `scheduler:${pacing.mode.toLowerCase()}`,
        },
      })

      await prisma.contact.update({
        where: { id: queued.id },
        data: {
          status: 'CALLING',
          lastCalledAt: new Date(),
        },
      })

      try {
        await provider.startOutboundCall(
          queued.phone,
          campaign.callerId,
          { callId: String(call.id), campaignId: campaign.id, contactId: queued.id },
        )
      } catch {
        await prisma.call.update({ where: { id: call.id }, data: { status: 'FAILED' } })
        await prisma.contact.update({ where: { id: queued.id }, data: { status: 'FAILED' } })
      }
    }

    const hasRemainingWork = await queueManager.campaignHasRemainingWork(campaign.id)
    if (!hasRemainingWork) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED', waitingReason: null },
      })
      await queueManager.clear(campaign.id)
    }
  }
}

setInterval(() => {
  if (schedulerRunning) return
  schedulerRunning = true
  void runSchedulerTick()
    .catch(() => undefined)
    .finally(() => {
      schedulerRunning = false
    })
}, SCHEDULER_INTERVAL_MS)

export default {}