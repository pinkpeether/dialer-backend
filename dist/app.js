"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpServer = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const socket_server_1 = require("./socket/socket.server");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = __importDefault(require("./routes/auth"));
const agents_1 = __importDefault(require("./routes/agents"));
const campaigns_1 = __importDefault(require("./routes/campaigns"));
const contacts_1 = __importDefault(require("./routes/contacts"));
const dialer_1 = __importDefault(require("./routes/dialer"));
const call_routes_1 = __importDefault(require("./routes/call.routes"));
const dnc_1 = __importDefault(require("./routes/dnc"));
const callbacks_1 = __importDefault(require("./routes/callbacks"));
const reports_1 = __importDefault(require("./routes/reports"));
require("./services/dialerScheduler");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
exports.httpServer = httpServer;
app.set('trust proxy', 1);
(0, socket_server_1.initSocket)(httpServer);
const allowedOrigins = (process.env.CORS_ORIGIN ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || origin === 'null' || origin.startsWith('file://')) {
            callback(null, true);
            return;
        }
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new errorHandler_1.AppError(`CORS blocked origin: ${origin}`, 403));
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.get('/api/health', (_req, res) => {
    res.json({
        success: true,
        message: 'PTDT Dialer API is healthy',
        timestamp: new Date().toISOString(),
    });
});
app.use('/api/auth', rateLimiter_1.authLimiter, auth_1.default);
app.use('/api', rateLimiter_1.apiLimiter);
app.use('/api/agents', agents_1.default);
app.use('/api/campaigns', campaigns_1.default);
app.use('/api/contacts', contacts_1.default);
app.use('/api/calls', call_routes_1.default);
app.use('/api/dialer', dialer_1.default);
app.use('/api/dnc', dnc_1.default);
app.use('/api/callbacks', callbacks_1.default);
app.use('/api/reports', reports_1.default);
app.use((_req, _res, next) => {
    next(new errorHandler_1.AppError('Route not found', 404));
});
app.use(errorHandler_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map