import prisma from '../lib/prisma'

/**
 * Simple in‑memory queue manager for campaign contacts.  This class
 * maintains a FIFO queue of contact IDs and phone numbers for each
 * running campaign.  Contacts are enqueued when a campaign starts
 * and dequeued by the dialer scheduler when it is time to dial.
 *
 * In a production environment you would likely back this with an
 * external store such as Redis so that multiple application
 * instances can coordinate work.  For now an in‑memory map
 * suffices for a single instance deployment.
 */
interface QueuedContact {
  id: number
  phone: string
}

export class QueueManager {
  private queues: Map<number, QueuedContact[]> = new Map()

  /**
   * Initialise the queue for a campaign by loading all pending
   * contacts from the database.  All contacts are immediately
   * updated to the IN_QUEUE status so that other workers do not
   * dial them concurrently.
   *
   * @param campaignId Campaign whose contacts should be enqueued
   */
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
        data:  { status: 'IN_QUEUE' },
      })
    }
  }

  /**
   * Check whether a campaign has an initialised queue.
   */
  hasQueue(campaignId: number): boolean {
    return this.queues.has(campaignId)
  }

  /**
   * Return the number of contacts remaining in the queue for a campaign.
   */
  size(campaignId: number): number {
    const q = this.queues.get(campaignId)
    return q ? q.length : 0
  }

  /**
   * Dequeue the next contact for a campaign.  Returns undefined if
   * there are no more contacts to dial.
   */
  dequeue(campaignId: number): QueuedContact | undefined {
    const queue = this.queues.get(campaignId)
    if (!queue || queue.length === 0) return undefined
    return queue.shift()
  }

  /**
   * Reset and clear the queue for a campaign.  Any contacts that were
   * queued but not dialled are reset back to the PENDING status so
   * they can be enqueued again in the future.
   */
  async clear(campaignId: number): Promise<void> {
    const queue = this.queues.get(campaignId)
    if (queue && queue.length > 0) {
      await prisma.contact.updateMany({
        where: { id: { in: queue.map(c => c.id) } },
        data:  { status: 'PENDING' },
      })
    }
    this.queues.delete(campaignId)
  }
}

export const queueManager = new QueueManager()
