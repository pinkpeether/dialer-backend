"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordSchema = exports.updateStatusSchema = exports.updateAgentSchema = exports.createAgentSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.createAgentSchema = joi_1.default.object({
    name: joi_1.default.string().min(2).max(50).required(),
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().min(6).max(50).required(),
    role: joi_1.default.string().valid('ADMIN', 'SUPERVISOR', 'AGENT').default('AGENT'),
    extension: joi_1.default.string().max(10).optional().allow(''),
    phone: joi_1.default.string().max(20).optional().allow(''),
});
exports.updateAgentSchema = joi_1.default.object({
    name: joi_1.default.string().min(2).max(50).optional(),
    email: joi_1.default.string().email().optional(),
    role: joi_1.default.string().valid('ADMIN', 'SUPERVISOR', 'AGENT').optional(),
    extension: joi_1.default.string().max(10).optional().allow(''),
    phone: joi_1.default.string().max(20).optional().allow(''),
    isActive: joi_1.default.boolean().optional(),
});
exports.updateStatusSchema = joi_1.default.object({
    status: joi_1.default.string()
        .valid('ONLINE', 'READY', 'BUSY', 'WRAP_UP', 'OFFLINE')
        .required(),
});
exports.resetPasswordSchema = joi_1.default.object({
    password: joi_1.default.string().min(6).max(50).required(),
});
//# sourceMappingURL=agent.validator.js.map