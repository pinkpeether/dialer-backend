"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAdmin = exports.logoutUser = exports.getProfile = exports.loginUser = exports.registerUser = exports.generateToken = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const errorHandler_1 = require("../middleware/errorHandler");
const generateToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    });
};
exports.generateToken = generateToken;
const registerUser = async (data) => {
    // Check duplicate email
    const existing = await prisma_1.default.user.findUnique({
        where: { email: data.email },
    });
    if (existing)
        throw new errorHandler_1.AppError('Email already registered', 409);
    // Generate agent code
    const count = await prisma_1.default.user.count();
    const agentCode = `AGT-${String(count + 1).padStart(3, '0')}`;
    // Hash password
    const hashedPassword = await bcryptjs_1.default.hash(data.password, 12);
    const user = await prisma_1.default.user.create({
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
            id: true,
            agentCode: true,
            name: true,
            email: true,
            role: true,
            extension: true,
            phone: true,
            status: true,
            createdAt: true,
        },
    });
    const token = (0, exports.generateToken)({
        id: user.id,
        email: user.email,
        role: user.role,
    });
    return { user, token };
};
exports.registerUser = registerUser;
const loginUser = async (email, password) => {
    // Find user
    const user = await prisma_1.default.user.findUnique({ where: { email } });
    if (!user)
        throw new errorHandler_1.AppError('Invalid email or password', 401);
    // Check active
    if (!user.isActive)
        throw new errorHandler_1.AppError('Account is deactivated', 403);
    // Check password
    const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!isMatch)
        throw new errorHandler_1.AppError('Invalid email or password', 401);
    // Update status to ONLINE
    await prisma_1.default.user.update({
        where: { id: user.id },
        data: { status: 'ONLINE' },
    });
    const token = (0, exports.generateToken)({
        id: user.id,
        email: user.email,
        role: user.role,
    });
    return {
        user: {
            id: user.id,
            agentCode: user.agentCode,
            name: user.name,
            email: user.email,
            role: user.role,
            extension: user.extension,
            phone: user.phone,
            status: 'ONLINE',
        },
        token,
    };
};
exports.loginUser = loginUser;
const getProfile = async (userId) => {
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            agentCode: true,
            name: true,
            email: true,
            role: true,
            extension: true,
            phone: true,
            status: true,
            isActive: true,
            createdAt: true,
        },
    });
    if (!user)
        throw new errorHandler_1.AppError('User not found', 404);
    return user;
};
exports.getProfile = getProfile;
const logoutUser = async (userId) => {
    await prisma_1.default.user.update({
        where: { id: userId },
        data: { status: 'OFFLINE' },
    });
};
exports.logoutUser = logoutUser;
const seedAdmin = async () => {
    const existing = await prisma_1.default.user.findUnique({
        where: { email: process.env.ADMIN_EMAIL },
    });
    if (existing)
        return;
    const hashedPassword = await bcryptjs_1.default.hash(process.env.ADMIN_PASSWORD, 12);
    await prisma_1.default.user.create({
        data: {
            agentCode: 'AGT-000',
            name: 'Super Admin',
            email: process.env.ADMIN_EMAIL,
            passwordHash: hashedPassword,
            role: 'ADMIN',
            status: 'ONLINE',
        },
    });
    console.log(`✅ Admin seeded: ${process.env.ADMIN_EMAIL}`);
};
exports.seedAdmin = seedAdmin;
//# sourceMappingURL=auth.service.js.map