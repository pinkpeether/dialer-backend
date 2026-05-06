"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.registerSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.registerSchema = joi_1.default.object({
    name: joi_1.default.string().min(2).max(50).required(),
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().min(6).max(50).required(),
    role: joi_1.default.string().valid('ADMIN', 'SUPERVISOR', 'AGENT').default('AGENT'),
    extension: joi_1.default.string().max(10).optional(),
    phone: joi_1.default.string().max(20).optional(),
});
exports.loginSchema = joi_1.default.object({
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().required(),
});
//# sourceMappingURL=auth.validator.js.map