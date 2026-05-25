import prisma from '../lib/prisma'

interface QueuedContact {
  id: number
  phone: string
}

export class QueueManager {
  private queues: Map<number, QueuedContact[]> = new Map()

  async initQueue(campaignId: number): Promise<void> {
    const now = new Date()

    const contacts = await prisma.contact.findMany({
      where: {
        campaignId,
        status: 'PENDING',
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
      orderBy: [
        { nextRetryAt: 'asc' },
        { createdAt: 'asc' },
      ],
      select: { id: true, phone: true },
    })

    const queue: QueuedContact[] = contacts.map(c => ({ id: c.id, phone: c.phone }))
    this.queues.set(campaignId, queue)

    if (queue.length > 0) {
      await prisma.contact.updateMany({
        where: { id: { in: queue.map(c => c.id) } },
        data: { status: 'IN_QUEUE' },
      })
    }
  }

  async refreshQueueIfEmpty(campaignId: number): Promise<void> {
    if (this.size(campaignId) > 0) return
    this.queues.delete(campaignId)
    await this.initQueue(campaignId)
  }

  hasQueue(campaignId: number): boolean {
    return this.queues.has(campaignId)
  }

  size(campaignId: number): number {
    const q = this.queues.get(campaignId)
    return q ? q.length : 0
  }

  dequeue(campaignId: number): QueuedContact | undefined {
    const queue = this.queues.get(campaignId)
    if (!queue || queue.length === 0) return undefined
    return queue.shift()
  }

  async clear(campaignId: number): Promise<void> {
    const queue = this.queues.get(campaignId)
    if (queue && queue.length > 0) {
      await prisma.contact.updateMany({
        where: { id: { in: queue.map(c => c.id) } },
        data: { status: 'PENDING' },
      })
    }
    this.queues.delete(campaignId)
  }

  async campaignHasRemainingWork(campaignId: number): Promise<boolean> {
    const remaining = await prisma.contact.count({
      where: {
        campaignId,
        OR: [
          { status: { in: ['PENDING', 'IN_QUEUE', 'CALLING'] } },
          { nextRetryAt: { not: null } },
        ],
      },
    })

    return remaining > 0
  }
}

export const queueManager = new QueueManager()