"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCallDisposition = exports.getCallById = exports.listCalls = exports.createSipCallLog = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const errorHandler_1 = require("../middleware/errorHandler");
const clampPagination = (page = 1, limit = 20) => ({
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 20,
});
const normalizePhone = (value) => value.replace(/[\s\-().]/g, '').trim();
const ensureCanAccessCall = (call, user, action) => {
    if (!user)
        throw new errorHandler_1.AppError('Unauthorized', 401);
    if (user.role === 'ADMIN' || user.role === 'SUPERVISOR')
        return;
    if (user.role === 'AGENT' && call.agentId === user.id)
        return;
    throw new errorHandler_1.AppError(action === 'view'
        ? 'You are not allowed to view this call'
        : 'You are not allowed to update this call', 403);
};
const getOrCreateSystemCampaign = async () => {
    const existing = await prisma_1.default.campaign.findFirst({ where: { name: '__sip__' } });
    if (existing)
        return existing;
    return prisma_1.default.campaign.create({
        data: {
            name: '__sip__',
            description: 'System campaign for SIP softphone calls',
            status: 'ACTIVE',
            callerId: 'SIP',
            dialingRatio: 1,
        },
    });
};
const getOrCreateSipContact = async (remoteNumber, campaignId) => {
    const phone = normalizePhone(remoteNumber) || remoteNumber.trim();
    const existing = await prisma_1.default.contact.findFirst({ where: { phone, campaignId } });
    if (existing)
        return existing;
    return prisma_1.default.contact.create({
        data: {
            phone,
            name: `SIP ${phone}`,
            status: 'CALLING',
            campaignId,
            lastCalledAt: new Date(),
        },
    });
};
const createSipCallLog = async (input, user) => {
    const remoteNumber = input.remoteNumber.trim();
    if (!remoteNumber)
        throw new errorHandler_1.AppError('remoteNumber is required', 400);
    const campaign = await getOrCreateSystemCampaign();
    const contact = await getOrCreateSipContact(remoteNumber, campaign.id);
    const startedAt = input.startedAt || new Date();
    const agentId = input.agentId ?? user?.id ?? null;
    const call = await prisma_1.default.call.create({
        data: {
            contactId: contact.id,
            campaignId: campaign.id,
            agentId,
            status: 'ANSWERED',
            startedAt,
            connectedAt: startedAt,
            providerCallId: `sip:${startedAt.getTime()}`,
        },
        include: {
            contact: true,
            agent: { select: { id: true, name: true, agentCode: true } },
            campaign: { select: { id: true, name: true } },
        },
    });
    return {
        ...call,
        direction: input.direction || 'outgoing',
        remoteNumber: contact.phone,
        source: 'sip',
    };
};
exports.createSipCallLog = createSipCallLog;
const listCalls = async (filters, user) => {
    const { campaignId, agentId, status, startDate, endDate } = filters;
    const { page, limit } = clampPagination(filters.page, filters.limit);
    const where = {};
    if (campaignId !== undefined)
        where.campaignId = campaignId;
    if (agentId !== undefined)
        where.agentId = agentId;
    if (status)
        where.status = status;
    if (startDate || endDate) {
        where.createdAt = {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
        };
    }
    if (user?.role === 'AGENT')
        where.agentId = user.id;
    const [calls, total] = await Promise.all([
        prisma_1.default.call.findMany({
            where,
            include: {
                contact: true,
                agent: { select: { id: true, name: true, agentCode: true } },
                campaign: { select: { id: true, name: true } },
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma_1.default.call.count({ where }),
    ]);
    return {
        calls,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
};
exports.listCalls = listCalls;
const getCallById = async (id, user) => {
    const call = await prisma_1.default.call.findUnique({
        where: { id },
        include: {
            contact: true,
            agent: { select: { id: true, name: true, agentCode: true } },
            campaign: { select: { id: true, name: true } },
        },
    });
    if (!call)
        throw new errorHandler_1.AppError('Call not found', 404);
    ensureCanAccessCall(call, user, 'view');
    return call;
};
exports.getCallById = getCallById;
const updateCallDisposition = async (id, disposition, notes, user) => {
    const existing = await prisma_1.default.call.findUnique({
        where: { id },
        select: { id: true, contactId: true, agentId: true },
    });
    if (!existing)
        throw new errorHandler_1.AppError('Call not found', 404);
    ensureCanAccessCall(existing, user, 'update');
    const call = await prisma_1.default.call.update({
        where: { id },
        data: {
            disposition,
            status: 'COMPLETED',
            endedAt: new Date(),
        },
        include: {
            contact: true,
            agent: { select: { id: true, name: true, agentCode: true } },
            campaign: { select: { id: true, name: true } },
        },
    });
    await prisma_1.default.contact.update({
        where: { id: existing.contactId },
        data: {
            status: disposition === 'DO_NOT_CALL' ? 'DNC' : 'DONE',
            ...(notes !== undefined ? { notes } : {}),
        },
    });
    return call;
};
exports.updateCallDisposition = updateCallDisposition;
//# sourceMappingURL=call.service.js.map