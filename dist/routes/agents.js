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
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const agent_validator_1 = require("../validators/agent.validator");
const router = (0, express_1.Router)();
// Sab routes protected hain
router.use(auth_1.authenticate);
// Stats — Admin + Supervisor
router.get('/stats', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), AgentController.getAgentStats);
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
// Update status — Admin + Supervisor + Agent himself
router.patch('/:id/status', (0, validate_1.validate)(agent_validator_1.updateStatusSchema), AgentController.updateAgentStatus);
// Reset password — Admin only
router.patch('/:id/reset-password', (0, auth_1.authorize)('ADMIN'), (0, validate_1.validate)(agent_validator_1.resetPasswordSchema), AgentController.resetAgentPassword);
exports.default = router;
//# sourceMappingURL=agents.js.map