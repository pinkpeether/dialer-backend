"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCallback = exports.getAllCallbacks = exports.createCallback = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const errorHandler_1 = require("../middleware/errorHandler");
const createCallback = async (data) => {
    const scheduledAt = new Date(data.scheduledAt);
    if (isNaN(scheduledAt.getTime()))
        throw new errorHandler_1.AppError('Invalid scheduledAt date', 400);
    return await prisma_1.default.callback.create({
        data: {
            contactId: data.contactId ?? null,
            callId: data.callId ?? null,
            agentId: data.agentId,
            scheduledAt,
            notes: data.notes ?? null,
            status: 'PENDING',
        },
        include: {
            contact: { select: { id: true, name: true, phone: true } },
            call: { select: { id: true, status: true, disposition: true } },
            agent: { select: { id: true, name: true, agentCode: true } },
        },
    });
};
exports.createCallback = createCallback;
const getAllCallbacks = async (filters) => {
    const { status, from, to, agentId, page = 1, limit = 30 } = filters;
    const where = {};
    if (status)
        where.status = status;
    if (agentId)
        where.agentId = agentId;
    if (from || to) {
        where.scheduledAt = {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
        };
    }
    const [callbacks, total] = await Promise.all([
        prisma_1.default.callback.findMany({
            where,
            include: {
                contact: { select: { id: true, name: true, phone: true } },
                call: { select: { id: true, status: true, disposition: true } },
                agent: { select: { id: true, name: true, agentCode: true } },
            },
            orderBy: { scheduledAt: 'asc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma_1.default.callback.count({ where }),
    ]);
    return {
        callbacks,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
};
exports.getAllCallbacks = getAllCallbacks;
const updateCallback = async (id, data, requestingUserId) => {
    const existing = await prisma_1.default.callback.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Callback not found', 404);
    const updateData = {};
    if (data.status)
        updateData.status = data.status;
    if (data.notes !== undefined)
        updateData.notes = data.notes;
    if (data.scheduledAt) {
        const d = new Date(data.scheduledAt);
        if (isNaN(d.getTime()))
            throw new errorHandler_1.AppError('Invalid scheduledAt date', 400);
        updateData.scheduledAt = d;
    }
    return await prisma_1.default.callback.update({
        where: { id },
        data: updateData,
        include: {
            contact: { select: { id: true, name: true, phone: true } },
            agent: { select: { id: true, name: true, agentCode: true } },
        },
    });
};
exports.updateCallback = updateCallback;
//# sourceMappingURL=callback.service.js.map