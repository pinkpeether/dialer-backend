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
exports.getAgentStats = exports.resetAgentPassword = exports.updateAgentStatus = exports.deleteAgent = exports.updateAgent = exports.createAgent = exports.getAgentById = exports.getAllAgents = void 0;
const AgentService = __importStar(require("../services/agent.service"));
const response_1 = require("../utils/response");
const getAllAgents = async (req, res, next) => {
    try {
        const { role, status, search, page, limit, isActive } = req.query;
        const result = await AgentService.getAllAgents({
            role: role,
            status: status,
            search: search,
            isActive: isActive !== undefined ? isActive === 'true' : undefined,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 20,
        });
        return (0, response_1.sendSuccess)(res, result, 'Agents fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getAllAgents = getAllAgents;
const getAgentById = async (req, res, next) => {
    try {
        const agent = await AgentService.getAgentById(Number(req.params.id));
        return (0, response_1.sendSuccess)(res, agent, 'Agent fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getAgentById = getAgentById;
const createAgent = async (req, res, next) => {
    try {
        const agent = await AgentService.createAgent(req.body);
        return (0, response_1.sendSuccess)(res, agent, 'Agent created successfully', 201);
    }
    catch (err) {
        return next(err);
    }
};
exports.createAgent = createAgent;
const updateAgent = async (req, res, next) => {
    try {
        const agent = await AgentService.updateAgent(Number(req.params.id), req.body);
        return (0, response_1.sendSuccess)(res, agent, 'Agent updated successfully');
    }
    catch (err) {
        return next(err);
    }
};
exports.updateAgent = updateAgent;
const deleteAgent = async (req, res, next) => {
    try {
        await AgentService.deleteAgent(Number(req.params.id));
        return (0, response_1.sendSuccess)(res, null, 'Agent deactivated successfully');
    }
    catch (err) {
        return next(err);
    }
};
exports.deleteAgent = deleteAgent;
const updateAgentStatus = async (req, res, next) => {
    try {
        const agent = await AgentService.updateAgentStatus(Number(req.params.id), req.body.status);
        return (0, response_1.sendSuccess)(res, agent, 'Agent status updated');
    }
    catch (err) {
        return next(err);
    }
};
exports.updateAgentStatus = updateAgentStatus;
const resetAgentPassword = async (req, res, next) => {
    try {
        await AgentService.resetAgentPassword(Number(req.params.id), req.body.password);
        return (0, response_1.sendSuccess)(res, null, 'Password reset successfully');
    }
    catch (err) {
        return next(err);
    }
};
exports.resetAgentPassword = resetAgentPassword;
const getAgentStats = async (req, res, next) => {
    try {
        const stats = await AgentService.getAgentStats();
        return (0, response_1.sendSuccess)(res, stats, 'Agent stats fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getAgentStats = getAgentStats;
//# sourceMappingURL=agent.controller.js.map