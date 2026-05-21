"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentStats = exports.resetAgentPassword = exports.updateAgentStatus = exports.deleteAgent = exports.updateAgent = exports.createAgent = exports.getAgentById = exports.getAllAgents = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const errorHandler_1 = require("../middleware/errorHandler");
const getAllAgents = async (filters) => {
    const { role, status, isActive, search, page = 1, limit = 20 } = filters;
    const where = {};
    if (role)
        where.role = role;
    if (status)
        where.status = status;
    if (isActive !== undefined)
        where.isActive = isActive;
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { agentCode: { contains: search, mode: 'insensitive' } },
            { extension: { contains: search, mode: 'insensitive' } },
        ];
    }
    const [agents, total] = await Promise.all([
        prisma_1.default.user.findMany({
            where,
            select: {
                id: true, agentCode: true, name: true,
                email: true, role: true, extension: true,
                phone: true, status: true, isActive: true,
                createdAt: true,
                _count: { select: { calls: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma_1.default.user.count({ where }),
    ]);
    return {
        agents,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
};
exports.getAllAgents = getAllAgents;
const getAgentById = async (id) => {
    const agent = await prisma_1.default.user.findUnique({
        where: { id },
        select: {
            id: true, agentCode: true, name: true,
            email: true, role: true, extension: true,
            phone: true, status: true, isActive: true,
            createdAt: true, updatedAt: true,
            _count: { select: { calls: true } },
            calls: {
                take: 10,
                orderBy: { startedAt: 'desc' },
                select: {
                    id: true, status: true, duration: true,
                    disposition: true, startedAt: true,
                    contact: { select: { name: true, phone: true } }
                }
            }
        },
    });
    if (!agent)
        throw new errorHandler_1.AppError('Agent not found', 404);
    return agent;
};
exports.getAgentById = getAgentById;
const createAgent = async (data) => {
    // Check duplicate email
    const existing = await prisma_1.default.user.findUnique({
        where: { email: data.email }
    });
    if (existing)
        throw new errorHandler_1.AppError('Email already registered', 409);
    // Auto-generate agent code
    const count = await prisma_1.default.user.count();
    const agentCode = `AGT-${String(count + 1).padStart(3, '0')}`;
    const hashedPassword = await bcryptjs_1.default.hash(data.password, 12);
    const agent = await prisma_1.default.user.create({
        data: {
            agentCode,
            name: data.name,
            email: data.email,
            passwordHash: hashedPassword,
            role: data.role || 'AGENT',
            extension: data.extension,
            phone: data.phone,
        },
        select: {
            id: true, agentCode: true, name: true,
            email: true, role: true, extension: true,
            phone: true, status: true, isActive: true,
            createdAt: true,
        },
    });
    return agent;
};
exports.createAgent = createAgent;
const updateAgent = async (id, data) => {
    // Check agent exists
    const existing = await prisma_1.default.user.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Agent not found', 404);
    // Check email duplicate if email is being changed
    if (data.email && data.email !== existing.email) {
        const emailTaken = await prisma_1.default.user.findUnique({
            where: { email: data.email }
        });
        if (emailTaken)
            throw new errorHandler_1.AppError('Email already in use', 409);
    }
    const agent = await prisma_1.default.user.update({
        where: { id },
        data,
        select: {
            id: true, agentCode: true, name: true,
            email: true, role: true, extension: true,
            phone: true, status: true, isActive: true,
            updatedAt: true,
        },
    });
    return agent;
};
exports.updateAgent = updateAgent;
const deleteAgent = async (id) => {
    const existing = await prisma_1.default.user.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Agent not found', 404);
    // Soft delete — isActive = false
    await prisma_1.default.user.update({
        where: { id },
        data: { isActive: false, status: 'OFFLINE' },
    });
};
exports.deleteAgent = deleteAgent;
const updateAgentStatus = async (id, status) => {
    const existing = await prisma_1.default.user.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Agent not found', 404);
    return await prisma_1.default.user.update({
        where: { id },
        data: { status },
        select: {
            id: true, agentCode: true,
            name: true, status: true,
        },
    });
};
exports.updateAgentStatus = updateAgentStatus;
const resetAgentPassword = async (id, newPassword) => {
    const existing = await prisma_1.default.user.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Agent not found', 404);
    const hashed = await bcryptjs_1.default.hash(newPassword, 12);
    await prisma_1.default.user.update({
        where: { id },
        data: { passwordHash: hashed },
    });
};
exports.resetAgentPassword = resetAgentPassword;
const getAgentStats = async () => {
    const [total, online, ready, busy, wrapUp, offline] = await Promise.all([
        prisma_1.default.user.count(),
        prisma_1.default.user.count({ where: { status: 'ONLINE' } }),
        prisma_1.default.user.count({ where: { status: 'READY' } }),
        prisma_1.default.user.count({ where: { status: 'BUSY' } }),
        prisma_1.default.user.count({ where: { status: 'WRAP_UP' } }),
        prisma_1.default.user.count({ where: { status: 'OFFLINE' } }),
    ]);
    return { total, online, ready, busy, wrapUp, offline };
};
exports.getAgentStats = getAgentStats;
//# sourceMappingURL=agent.service.js.map