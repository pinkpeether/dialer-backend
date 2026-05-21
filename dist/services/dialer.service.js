"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeCallToAgent = exports.getActiveCampaigns = exports.stopCampaign = exports.startCampaign = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const twilio_service_1 = require("./twilio.service");
const logger_1 = __importDefault(require("../utils/logger"));
const errorHandler_1 = require("../middleware/errorHandler");
// Active campaigns tracker
const activeCampaigns = new Map();
const startCampaign = async (campaignId) => {
    const campaign = await prisma_1.default.campaign.findUnique({
        where: { id: campaignId }
    });
    if (!campaign)
        throw new errorHandler_1.AppError('Campaign not found', 404);
    if (campaign.status !== 'ACTIVE') {
        throw new errorHandler_1.AppError('Campaign must be ACTIVE to start dialing', 400);
    }
    if (activeCampaigns.has(campaignId)) {
        throw new errorHandler_1.AppError('Campaign is already running', 400);
    }
    logger_1.default.info(`🚀 Starting campaign: ${campaign.name}`);
    await dialNext(campaignId);
};
exports.startCampaign = startCampaign;
const stopCampaign = async (campaignId) => {
    const timer = activeCampaigns.get(campaignId);
    if (timer) {
        clearTimeout(timer);
        activeCampaigns.delete(campaignId);
    }
    logger_1.default.info(`⛔ Campaign ${campaignId} stopped`);
};
exports.stopCampaign = stopCampaign;
const dialNext = async (campaignId) => {
    try {
        const campaign = await prisma_1.default.campaign.findUnique({
            where: { id: campaignId }
        });
        if (!campaign || campaign.status !== 'ACTIVE') {
            activeCampaigns.delete(campaignId);
            return;
        }
        // Get available agents
        const availableAgents = await prisma_1.default.user.findMany({
            where: { status: 'READY', isActive: true },
            select: { id: true }
        });
        if (availableAgents.length === 0) {
            logger_1.default.info(`⏳ No agents available — waiting 5s`);
            const timer = setTimeout(() => dialNext(campaignId), 5000);
            activeCampaigns.set(campaignId, timer);
            return;
        }
        // Calculate simultaneous dials
        const simultaneousDials = availableAgents.length * campaign.dialingRatio;
        // Get pending contacts
        const pendingContacts = await prisma_1.default.contact.findMany({
            where: {
                campaignId,
                status: 'PENDING',
            },
            take: simultaneousDials,
            orderBy: { createdAt: 'asc' },
        });
        if (pendingContacts.length === 0) {
            logger_1.default.info(`✅ Campaign ${campaignId} — all contacts dialed!`);
            await prisma_1.default.campaign.update({
                where: { id: campaignId },
                data: { status: 'COMPLETED' }
            });
            activeCampaigns.delete(campaignId);
            return;
        }
        // Dial all pending contacts simultaneously
        logger_1.default.info(`📞 Dialing ${pendingContacts.length} numbers for campaign ${campaignId}`);
        await Promise.allSettled(pendingContacts.map(contact => (0, twilio_service_1.initiateCall)(contact.id, campaignId)));
        // Schedule next batch after 10 seconds
        const timer = setTimeout(() => dialNext(campaignId), 10000);
        activeCampaigns.set(campaignId, timer);
    }
    catch (err) {
        logger_1.default.error(`Dialer error for campaign ${campaignId}: ${err}`);
        const timer = setTimeout(() => dialNext(campaignId), 15000);
        activeCampaigns.set(campaignId, timer);
    }
};
const getActiveCampaigns = () => {
    return Array.from(activeCampaigns.keys());
};
exports.getActiveCampaigns = getActiveCampaigns;
const routeCallToAgent = async (callId) => {
    // Find first available READY agent
    const agent = await prisma_1.default.user.findFirst({
        where: { status: 'READY', isActive: true },
        orderBy: { updatedAt: 'asc' }, // longest waiting agent first
    });
    if (!agent)
        return null;
    // Mark agent as BUSY
    await prisma_1.default.user.update({
        where: { id: agent.id },
        data: { status: 'BUSY' }
    });
    // Update call with agent
    await prisma_1.default.call.update({
        where: { id: callId },
        data: { agentId: agent.id, connectedAt: new Date() }
    });
    logger_1.default.info(`🔗 Call ${callId} routed to agent ${agent.id}`);
    return agent.id;
};
exports.routeCallToAgent = routeCallToAgent;
//# sourceMappingURL=dialer.service.js.map