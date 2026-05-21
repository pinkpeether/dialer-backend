"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeFromDnc = exports.addToDnc = exports.checkDnc = exports.getAllDnc = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const errorHandler_1 = require("../middleware/errorHandler");
const getAllDnc = async (filters) => {
    const { page = 1, limit = 50, search } = filters;
    const where = {};
    if (search) {
        where.phone = { contains: search, mode: 'insensitive' };
    }
    const [entries, total] = await Promise.all([
        prisma_1.default.dNCList.findMany({
            where,
            select: {
                id: true,
                phone: true,
                reason: true,
                createdAt: true,
                addedBy: {
                    select: { id: true, name: true, agentCode: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma_1.default.dNCList.count({ where }),
    ]);
    return {
        entries,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
};
exports.getAllDnc = getAllDnc;
const checkDnc = async (phone) => {
    const entry = await prisma_1.default.dNCList.findUnique({
        where: { phone: normalizePhone(phone) },
    });
    return entry !== null;
};
exports.checkDnc = checkDnc;
const addToDnc = async (phone, reason, addedByUserId) => {
    const normalized = normalizePhone(phone);
    const existing = await prisma_1.default.dNCList.findUnique({ where: { phone: normalized } });
    if (existing)
        throw new errorHandler_1.AppError('Phone number is already on the DNC list', 409);
    return await prisma_1.default.dNCList.create({
        data: {
            phone: normalized,
            reason: reason ?? null,
            addedByUserId: addedByUserId,
        },
        select: {
            id: true,
            phone: true,
            reason: true,
            createdAt: true,
            addedBy: { select: { id: true, name: true } },
        },
    });
};
exports.addToDnc = addToDnc;
const removeFromDnc = async (id) => {
    const existing = await prisma_1.default.dNCList.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('DNC entry not found', 404);
    await prisma_1.default.dNCList.delete({ where: { id } });
};
exports.removeFromDnc = removeFromDnc;
// ── Helpers ───────────────────────────────────────────────────────────────────
/** Strip spaces/dashes — keep + prefix intact so +92 is preserved */
const normalizePhone = (phone) => phone.replace(/[\s\-().]/g, '').trim();
//# sourceMappingURL=dnc.service.js.map