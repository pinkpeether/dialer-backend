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
const auth_1 = __importDefault(require("./routes/auth"));
const agents_1 = __importDefault(require("./routes/agents"));
const campaigns_1 = __importDefault(require("./routes/campaigns"));
const contacts_1 = __importDefault(require("./routes/contacts"));
const dialer_1 = __importDefault(require("./routes/dialer"));
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
exports.httpServer = httpServer;
(0, socket_server_1.initSocket)(httpServer);
app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/auth', auth_1.default);
app.use('/api/agents', agents_1.default);
app.use('/api/campaigns', campaigns_1.default);
app.use('/api/contacts', contacts_1.default);
app.use('/api/dialer', dialer_1.default);
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});
exports.default = app;
//# sourceMappingURL=app.js.map