"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitToDashboard = exports.emitToAgent = exports.getIO = exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
let io;
const initSocket = (httpServer) => {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token)
                throw new Error('No token');
            const user = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
            socket.user = user;
            next();
        }
        catch {
            next(new Error('Unauthorized'));
        }
    });
    io.on('connection', (socket) => {
        const user = socket.user;
        console.log(`🔌 Socket connected: ${user?.email}`);
        socket.join(`agent:${user?.id}`);
        socket.join('dashboard');
        socket.on('agent:status', async (status) => {
            const { prisma } = await Promise.resolve().then(() => __importStar(require('../lib/prisma')));
            await prisma.user.update({
                where: { id: user.id },
                data: { status: status },
            });
            io.to('dashboard').emit('agent:statusChanged', {
                agentId: user.id,
                status,
                name: user.name,
            });
        });
        socket.on('disconnect', async () => {
            console.log(`🔌 Socket disconnected: ${user?.email}`);
            const { prisma } = await Promise.resolve().then(() => __importStar(require('../lib/prisma')));
            await prisma.user.update({
                where: { id: user.id },
                data: { status: 'OFFLINE' },
            }).catch(() => { });
            io.to('dashboard').emit('agent:statusChanged', {
                agentId: user.id,
                status: 'OFFLINE',
                name: user.name,
            });
        });
    });
    return io;
};
exports.initSocket = initSocket;
const getIO = () => {
    if (!io)
        throw new Error('Socket not initialized');
    return io;
};
exports.getIO = getIO;
const emitToAgent = (agentId, event, data) => {
    (0, exports.getIO)().to(`agent:${agentId}`).emit(event, data);
};
exports.emitToAgent = emitToAgent;
const emitToDashboard = (event, data) => {
    (0, exports.getIO)().to('dashboard').emit(event, data);
};
exports.emitToDashboard = emitToDashboard;
//# sourceMappingURL=socket.server.js.map