"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../lib/prisma"));
const queueManager_1 = require("./queueManager");
const callProviderFactory_1 = require("../providers/callProviderFactory");
/**
 * Dialer scheduler that regularly checks for running campaigns
 * and dispatches outbound calls for queued contacts.  This is
 * a simple interval‑based loop and does not yet support more
 * sophisticated scheduling or throttling.  It relies on the
 * QueueManager to provide the next contact to dial and on the
 * CallProvider abstraction to actually place the call.
 */
const SCHEDULER_INTERVAL_MS = 3000;
async function runSchedulerTick() {
    // Find all campaigns currently in ACTIVE status
    const campaigns = await prisma_1.default.campaign.findMany({ where: { status: 'ACTIVE' } });
    if (campaigns.length === 0)
        return;
    // Obtain a single instance of our call provider for all calls
    let provider;
    try {
        provider = (0, callProviderFactory_1.getCallProvider)();
    }
    catch (err) {
        // If provider cannot be constructed there is nothing to do
        return;
    }
    for (const campaign of campaigns) {
        // Ensure the queue for this campaign is initialised
        if (!queueManager_1.queueManager.hasQueue(campaign.id)) {
            await queueManager_1.queueManager.initQueue(campaign.id);
        }
        // Count currently available agents
        const availableAgents = await prisma_1.default.user.findMany({
            where: { status: 'READY' },
            select: { id: true },
        });
        const slots = availableAgents.length * campaign.dialingRatio;
        if (slots <= 0)
            continue;
        for (let i = 0; i < slots; i++) {
            const queued = queueManager_1.queueManager.dequeue(campaign.id);
            if (!queued)
                break;
            // Create call record with INITIATED status
            const call = await prisma_1.default.call.create({
                data: {
                    contactId: queued.id,
                    campaignId: campaign.id,
                    status: 'INITIATED',
                },
            });
            // Update contact status to CALLING
            await prisma_1.default.contact.update({ where: { id: queued.id }, data: { status: 'CALLING' } });
            // Initiate call via provider
            try {
                await provider.startOutboundCall(queued.phone, campaign.callerId, { callId: String(call.id), campaignId: campaign.id, contactId: queued.id });
            }
            catch (err) {
                // If the call fails to initiate, mark the contact as FAILED and record call status
                await prisma_1.default.call.update({ where: { id: call.id }, data: { status: 'FAILED' } });
                await prisma_1.default.contact.update({ where: { id: queued.id }, data: { status: 'FAILED' } });
            }
        }
        // If queue is empty after dialing all slots, mark campaign as COMPLETED
        if (queueManager_1.queueManager.size(campaign.id) === 0) {
            await prisma_1.default.campaign.update({ where: { id: campaign.id }, data: { status: 'COMPLETED' } });
            await queueManager_1.queueManager.clear(campaign.id);
        }
    }
}
// Start the scheduler loop.  In the future this could be moved into
// an external worker process or replaced with a more sophisticated
// job scheduler (Bull, Agenda, etc.).
setInterval(runSchedulerTick, SCHEDULER_INTERVAL_MS);
exports.default = {};
//# sourceMappingURL=dialerScheduler.js.map