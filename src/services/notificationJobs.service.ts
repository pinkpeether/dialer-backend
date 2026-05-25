import prisma from '../lib/prisma'
import { createNotification } from './notification.service'

const WINDOW_MINUTES = 15

const sentRecently = async (type: string, entityId: string) => {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000)
  const existing = await prisma.notification.findFirst({
    where: {
      type,
      createdAt: { gte: since },
      metadata: { path: ['entityId'], equals: entityId },
    },
  })
  return Boolean(existing)
}

export const runCallbackNotificationJob = async () => {
  const now = new Date()
  const soon = new Date(now.getTime() + WINDOW_MINUTES * 60 * 1000)

  const callbacks = await prisma.callback.findMany({
    where: { status: { in: ['PENDING', 'RESCHEDULED'] }, scheduledAt: { lte: soon } },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      call: { select: { id: true, agentId: true } },
    },
    take: 100,
    orderBy: { scheduledAt: 'asc' },
  })

  let created = 0

  for (const cb of callbacks) {
    const overdue = cb.scheduledAt < now
    const type = overdue ? 'CALLBACK_OVERDUE' : 'CALLBACK_DUE'
    const entityId = String(cb.id)
    if (await sentRecently(type, entityId)) continue

    await createNotification({
      userId: cb.agentId || cb.call?.agentId || null,
      type,
      title: overdue ? 'Callback overdue' : 'Callback due soon',
      body: `${cb.contact?.name || 'Contact'} (${cb.contact?.phone || 'Unknown phone'})`,
      metadata: { entity: 'Callback', entityId, callbackId: cb.id, contactId: cb.contactId, scheduledAt: cb.scheduledAt.toISOString() },
    })
    created += 1
  }

  return { scanned: callbacks.length, created }
}

export const runCampaignNotificationJob = async () => {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
    include: { _count: { select: { contacts: { where: { status: 'PENDING' } } } } },
    take: 100,
  })

  let created = 0

  for (const campaign of campaigns) {
    if (campaign.status === 'ACTIVE' && campaign._count.contacts <= 25) {
      const type = 'LOW_CONTACTS'
      const entityId = String(campaign.id)
      if (!(await sentRecently(type, entityId))) {
        await createNotification({
          userId: null,
          type,
          title: 'Campaign low on contacts',
          body: `${campaign.name} has ${campaign._count.contacts} pending contacts.`,
          metadata: { entity: 'Campaign', entityId, campaignId: campaign.id },
        })
        created += 1
      }
    }

    if (campaign.status === 'COMPLETED') {
      const type = 'CAMPAIGN_COMPLETE'
      const entityId = String(campaign.id)
      if (!(await sentRecently(type, entityId))) {
        await createNotification({
          userId: null,
          type,
          title: 'Campaign completed',
          body: `${campaign.name} is completed.`,
          metadata: { entity: 'Campaign', entityId, campaignId: campaign.id },
        })
        created += 1
      }
    }
  }

  return { scanned: campaigns.length, created }
}

export const runAllNotificationJobs = async () => {
  const callbacks = await runCallbackNotificationJob()
  const campaigns = await runCampaignNotificationJob()
  return { callbacks, campaigns, totalCreated: callbacks.created + campaigns.created }
}
