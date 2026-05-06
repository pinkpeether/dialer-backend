"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateContactSchema = exports.createContactSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.createContactSchema = joi_1.default.object({
    name: joi_1.default.string().min(1).max(100).required(),
    phone: joi_1.default.string().min(7).max(20).required(),
    email: joi_1.default.string().email().optional().allow(''),
    company: joi_1.default.string().max(100).optional().allow(''),
    notes: joi_1.default.string().max(1000).optional().allow(''),
    campaignId: joi_1.default.number().integer().positive().required(),
});
exports.updateContactSchema = joi_1.default.object({
    name: joi_1.default.string().min(1).max(100).optional(),
    phone: joi_1.default.string().min(7).max(20).optional(),
    email: joi_1.default.string().email().optional().allow(''),
    company: joi_1.default.string().max(100).optional().allow(''),
    notes: joi_1.default.string().max(1000).optional().allow(''),
    status: joi_1.default.string()
        .valid('PENDING', 'CALLING', 'ANSWERED', 'NO_ANSWER', 'BUSY', 'DONE', 'DNC')
        .optional(),
});
//# sourceMappingURL=contact.validator.js.map