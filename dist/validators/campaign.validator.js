"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCampaignSchema = exports.createCampaignSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.createCampaignSchema = joi_1.default.object({
    name: joi_1.default.string().min(2).max(100).required(),
    description: joi_1.default.string().max(500).optional().allow(''),
    dialRatio: joi_1.default.number().min(1).max(10).default(3),
    maxRetries: joi_1.default.number().min(0).max(10).default(3),
    retryDelay: joi_1.default.number().min(5).max(1440).default(30),
    script: joi_1.default.string().max(5000).optional().allow(''),
    startTime: joi_1.default.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    endTime: joi_1.default.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    timezone: joi_1.default.string().default('Asia/Karachi'),
});
exports.updateCampaignSchema = joi_1.default.object({
    name: joi_1.default.string().min(2).max(100).optional(),
    description: joi_1.default.string().max(500).optional().allow(''),
    dialRatio: joi_1.default.number().min(1).max(10).optional(),
    maxRetries: joi_1.default.number().min(0).max(10).optional(),
    retryDelay: joi_1.default.number().min(5).max(1440).optional(),
    script: joi_1.default.string().max(5000).optional().allow(''),
    startTime: joi_1.default.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    endTime: joi_1.default.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    timezone: joi_1.default.string().optional(),
});
//# sourceMappingURL=campaign.validator.js.map