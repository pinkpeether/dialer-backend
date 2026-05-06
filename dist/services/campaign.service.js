"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCampaignStats = exports.cloneCampaign = exports.updateCampaignStatus = exports.deleteCampaign = exports.updateCampaign = exports.createCampaign = exports.getCampaignById = exports.getAllCampaigns = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const errorHandler_1 = require("../middleware/errorHandler");
const getAllCampaigns = async (filters) => {
    const { status, search, page = 1, limit = 20 } = filters;
    const where = {};
    if (status)
        where.status = status;
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
        ];
    }
    const [campaigns, total] = await Promise.all([
        prisma_1.default.campaign.findMany({
            where,
            include: {
                _count: {
                    select: {
                        contacts: true,
                        calls: true,
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma_1.default.campaign.count({ where }),
    ]);
    // Add extra stats per campaign
    const enriched = await Promise.all(campaigns.map(async (c) => {
        const [pending, answered, missed, active] = await Promise.all([
            prisma_1.default.contact.count({ where: { campaignId: c.id, status: 'PENDING' } }),
            prisma_1.default.contact.count({ where: { campaignId: c.id, status: { in: ['ANSWERED', 'DONE'] } } }),
            prisma_1.default.contact.count({ where: { campaignId: c.id, status: { in: ['NO_ANSWER', 'BUSY'] } } }),
            prisma_1.default.contact.count({ where: { campaignId: c.id, status: 'CALLING' } }),
        ]);
        return { ...c, stats: { pending, answered, missed, active } };
    }));
    return {
        campaigns: enriched,
        pagination: {
            total, page, limit,
            totalPages: Math.ceil(total / limit),
        }
    };
};
exports.getAllCampaigns = getAllCampaigns;
const getCampaignById = async (id) => {
    const campaign = await prisma_1.default.campaign.findUnique({
        where: { id },
        include: {
            _count: { select: { contacts: true, calls: true } }
        }
    });
    if (!campaign)
        throw new errorHandler_1.AppError('Campaign not found', 404);
    const [pending, answered, missed, active, calling] = await Promise.all([
        prisma_1.default.contact.count({ where: { campaignId: id, status: 'PENDING' } }),
        prisma_1.default.contact.count({ where: { campaignId: id, status: { in: ['ANSWERED', 'DONE'] } } }),
        prisma_1.default.contact.count({ where: { campaignId: id, status: { in: ['NO_ANSWER', 'BUSY'] } } }),
        prisma_1.default.contact.count({ where: { campaignId: id, status: 'CALLING' } }),
        prisma_1.default.contact.count({ where: { campaignId: id, status: 'CALLING' } }),
    ]);
    const total = pending + answered + missed + calling;
    const answerRate = total > 0 ? Math.round((answered / total) * 100) : 0;
    return {
        ...campaign,
        stats: { pending, answered, missed, active, total, answerRate }
    };
};
exports.getCampaignById = getCampaignById;
const createCampaign = async (data) => {
    return await prisma_1.default.campaign.create({
        data: {
            name: data.name,
            description: data.description,
            dialRatio: data.dialRatio || 3,
            maxRetries: data.maxRetries || 3,
            retryDelay: data.retryDelay || 30,
            script: data.script,
            startTime: data.startTime,
            endTime: data.endTime,
            timezone: data.timezone || 'Asia/Karachi',
            status: 'DRAFT',
        }
    });
};
exports.createCampaign = createCampaign;
const updateCampaign = async (id, data) => {
    const existing = await prisma_1.default.campaign.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Campaign not found', 404);
    return await prisma_1.default.campaign.update({ where: { id }, data });
};
exports.updateCampaign = updateCampaign;
const deleteCampaign = async (id) => {
    const existing = await prisma_1.default.campaign.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Campaign not found', 404);
    if (existing.status === 'ACTIVE') {
        throw new errorHandler_1.AppError('Cannot delete an active campaign — pause it first', 400);
    }
    await prisma_1.default.campaign.delete({ where: { id } });
};
exports.deleteCampaign = deleteCampaign;
const updateCampaignStatus = async (id, status) => {
    const existing = await prisma_1.default.campaign.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Campaign not found', 404);
    // Validate transitions
    const allowed = {
        DRAFT: ['ACTIVE'],
        ACTIVE: ['PAUSED', 'COMPLETED'],
        PAUSED: ['ACTIVE', 'COMPLETED'],
        COMPLETED: [],
    };
    if (!allowed[existing.status].includes(status)) {
        throw new errorHandler_1.AppError(`Cannot change status from ${existing.status} to ${status}`, 400);
    }
    return await prisma_1.default.campaign.update({
        where: { id },
        data: { status },
    });
};
exports.updateCampaignStatus = updateCampaignStatus;
const cloneCampaign = async (id) => {
    const original = await prisma_1.default.campaign.findUnique({ where: { id } });
    if (!original)
        throw new errorHandler_1.AppError('Campaign not found', 404);
    return await prisma_1.default.campaign.create({
        data: {
            name: `${original.name} (Copy)`,
            description: original.description ?? undefined,
            dialRatio: original.dialRatio,
            maxRetries: original.maxRetries,
            retryDelay: original.retryDelay,
            script: original.script ?? undefined,
            startTime: original.startTime ?? undefined,
            endTime: original.endTime ?? undefined,
            timezone: original.timezone,
            status: 'DRAFT',
        }
    });
};
exports.cloneCampaign = cloneCampaign;
const getCampaignStats = async () => {
    const [total, draft, active, paused, completed] = await Promise.all([
        prisma_1.default.campaign.count(),
        prisma_1.default.campaign.count({ where: { status: 'DRAFT' } }),
        prisma_1.default.campaign.count({ where: { status: 'ACTIVE' } }),
        prisma_1.default.campaign.count({ where: { status: 'PAUSED' } }),
        prisma_1.default.campaign.count({ where: { status: 'COMPLETED' } }),
    ]);
    return { total, draft, active, paused, completed };
};
exports.getCampaignStats = getCampaignStats;
//# sourceMappingURL=campaign.service.js.map