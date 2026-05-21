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
    id: number;
    phone: string;
}
export declare class QueueManager {
    private queues;
    /**
     * Initialise the queue for a campaign by loading all pending
     * contacts from the database.  All contacts are immediately
     * updated to the IN_QUEUE status so that other workers do not
     * dial them concurrently.
     *
     * @param campaignId Campaign whose contacts should be enqueued
     */
    initQueue(campaignId: number): Promise<void>;
    /**
     * Check whether a campaign has an initialised queue.
     */
    hasQueue(campaignId: number): boolean;
    /**
     * Return the number of contacts remaining in the queue for a campaign.
     */
    size(campaignId: number): number;
    /**
     * Dequeue the next contact for a campaign.  Returns undefined if
     * there are no more contacts to dial.
     */
    dequeue(campaignId: number): QueuedContact | undefined;
    /**
     * Reset and clear the queue for a campaign.  Any contacts that were
     * queued but not dialled are reset back to the PENDING status so
     * they can be enqueued again in the future.
     */
    clear(campaignId: number): Promise<void>;
}
export declare const queueManager: QueueManager;
export {};
//# sourceMappingURL=queueManager.d.ts.map