"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueManager = exports.QueueManager = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
class QueueManager {
    constructor() {
        this.queues = new Map();
    }
    /**
     * Initialise the queue for a campaign by loading all pending
     * contacts from the database.  All contacts are immediately
     * updated to the IN_QUEUE status so that other workers do not
     * dial them concurrently.
     *
     * @param campaignId Campaign whose contacts should be enqueued
     */
    async initQueue(campaignId) {
        const contacts = await prisma_1.default.contact.findMany({
            where: {
                campaignId,
                status: 'PENDING',
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true, phone: true },
        });
        const queue = contacts.map(c => ({ id: c.id, phone: c.phone }));
        this.queues.set(campaignId, queue);
        if (queue.length > 0) {
            await prisma_1.default.contact.updateMany({
                where: { id: { in: queue.map(c => c.id) } },
                data: { status: 'IN_QUEUE' },
            });
        }
    }
    /**
     * Check whether a campaign has an initialised queue.
     */
    hasQueue(campaignId) {
        return this.queues.has(campaignId);
    }
    /**
     * Return the number of contacts remaining in the queue for a campaign.
     */
    size(campaignId) {
        const q = this.queues.get(campaignId);
        return q ? q.length : 0;
    }
    /**
     * Dequeue the next contact for a campaign.  Returns undefined if
     * there are no more contacts to dial.
     */
    dequeue(campaignId) {
        const queue = this.queues.get(campaignId);
        if (!queue || queue.length === 0)
            return undefined;
        return queue.shift();
    }
    /**
     * Reset and clear the queue for a campaign.  Any contacts that were
     * queued but not dialled are reset back to the PENDING status so
     * they can be enqueued again in the future.
     */
    async clear(campaignId) {
        const queue = this.queues.get(campaignId);
        if (queue && queue.length > 0) {
            await prisma_1.default.contact.updateMany({
                where: { id: { in: queue.map(c => c.id) } },
                data: { status: 'PENDING' },
            });
        }
        this.queues.delete(campaignId);
    }
}
exports.QueueManager = QueueManager;
exports.queueManager = new QueueManager();
//# sourceMappingURL=queueManager.js.map