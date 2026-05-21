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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AgentController = __importStar(require("../controllers/agent.controller"));
const AgentService = __importStar(require("../services/agent.service"));
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const response_1 = require("../utils/response");
const agent_validator_1 = require("../validators/agent.validator");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Stats — Admin + Supervisor
router.get('/stats', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), AgentController.getAgentStats);
// PATCH /agents/me/status — any authenticated user updates their own status
// IMPORTANT: keep /me routes before /:id routes.
router.patch('/me/status', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR', 'AGENT'), (0, validate_1.validate)(agent_validator_1.updateStatusSchema), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const agent = await AgentService.updateAgentStatus(userId, req.body.status);
        return (0, response_1.sendSuccess)(res, agent, 'Agent status updated');
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /agents/me — any authenticated user updates their own profile (name, phone, extension)
router.patch('/me', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR', 'AGENT'), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { name, phone, extension } = req.body;
        // Whitelist: agents can only update name/phone/extension — not role/isActive
        const allowedData = {};
        if (typeof name === 'string' && name.trim())
            allowedData.name = name.trim();
        if (typeof phone === 'string')
            allowedData.phone = phone.trim() || undefined;
        if (typeof extension === 'string')
            allowedData.extension = extension.trim() || undefined;
        const agent = await AgentService.updateAgent(userId, allowedData);
        return (0, response_1.sendSuccess)(res, agent, 'Profile updated');
    }
    catch (err) {
        return next(err);
    }
});
// List all agents — Admin + Supervisor
router.get('/', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), AgentController.getAllAgents);
// Single agent — Admin + Supervisor
router.get('/:id', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), AgentController.getAgentById);
// Create agent — Admin only
router.post('/', (0, auth_1.authorize)('ADMIN'), (0, validate_1.validate)(agent_validator_1.createAgentSchema), AgentController.createAgent);
// Update agent — Admin only
router.put('/:id', (0, auth_1.authorize)('ADMIN'), (0, validate_1.validate)(agent_validator_1.updateAgentSchema), AgentController.updateAgent);
// Delete agent (soft) — Admin only
router.delete('/:id', (0, auth_1.authorize)('ADMIN'), AgentController.deleteAgent);
// Update status for specific agent — Admin + Supervisor
router.patch('/:id/status', (0, validate_1.validate)(agent_validator_1.updateStatusSchema), AgentController.updateAgentStatus);
// Reset password — Admin only
router.patch('/:id/reset-password', (0, auth_1.authorize)('ADMIN'), (0, validate_1.validate)(agent_validator_1.resetPasswordSchema), AgentController.resetAgentPassword);
exports.default = router;
//# sourceMappingURL=agents.js.map