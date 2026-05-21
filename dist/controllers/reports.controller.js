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
exports.getAgentBreakdown = exports.getCampaignBreakdown = exports.getCallTrend = exports.getSummary = void 0;
const ReportsService = __importStar(require("../services/reports.service"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const parseDate = (v) => {
    if (typeof v !== 'string' || !v.trim())
        return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
};
const getSummary = async (req, res, next) => {
    try {
        const { from, to, campaignId, agentId } = req.query;
        const result = await ReportsService.getSummary({
            from: parseDate(from),
            to: parseDate(to),
            campaignId: campaignId ? Number(campaignId) : undefined,
            agentId: agentId ? Number(agentId) : undefined,
        });
        return (0, response_1.sendSuccess)(res, result, 'Summary fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getSummary = getSummary;
const getCallTrend = async (req, res, next) => {
    try {
        const { from, to, granularity } = req.query;
        if (granularity && granularity !== 'day' && granularity !== 'week') {
            throw new errorHandler_1.AppError('granularity must be day or week', 400);
        }
        const result = await ReportsService.getCallTrend({
            from: parseDate(from),
            to: parseDate(to),
            granularity: granularity,
        });
        return (0, response_1.sendSuccess)(res, result, 'Call trend fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getCallTrend = getCallTrend;
const getCampaignBreakdown = async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const result = await ReportsService.getCampaignBreakdown({
            from: parseDate(from),
            to: parseDate(to),
        });
        return (0, response_1.sendSuccess)(res, result, 'Campaign breakdown fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getCampaignBreakdown = getCampaignBreakdown;
const getAgentBreakdown = async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const result = await ReportsService.getAgentBreakdown({
            from: parseDate(from),
            to: parseDate(to),
        });
        return (0, response_1.sendSuccess)(res, result, 'Agent breakdown fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getAgentBreakdown = getAgentBreakdown;
//# sourceMappingURL=reports.controller.js.map