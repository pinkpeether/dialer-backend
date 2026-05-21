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
exports.updateDisposition = exports.getCallById = exports.createCall = exports.listCalls = void 0;
const CallService = __importStar(require("../services/call.service"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const CALL_STATUSES = [
    'INITIATED',
    'RINGING',
    'ANSWERED',
    'NO_ANSWER',
    'FAILED',
    'COMPLETED',
];
const STATUS_ALIASES = {
    answered: 'ANSWERED',
    completed: 'COMPLETED',
    missed: 'NO_ANSWER',
    no_answer: 'NO_ANSWER',
    noanswer: 'NO_ANSWER',
    failed: 'FAILED',
    queued: 'INITIATED',
    pending: 'INITIATED',
    in_progress: 'RINGING',
    calling: 'RINGING',
    ringing: 'RINGING',
};
const CALL_DISPOSITIONS = [
    'ANSWERED',
    'NO_ANSWER',
    'VOICEMAIL',
    'CALLBACK',
    'WRONG_NUMBER',
    'DO_NOT_CALL',
];
const getQueryString = (value) => {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};
const getQueryNumber = (value) => {
    const raw = getQueryString(value);
    if (!raw)
        return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const getQueryDate = (value) => {
    const raw = getQueryString(value);
    if (!raw)
        return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
const getQueryStatus = (value) => {
    const raw = getQueryString(value);
    if (!raw)
        return undefined;
    const normalized = raw.trim();
    const alias = STATUS_ALIASES[normalized.toLowerCase()];
    if (alias)
        return alias;
    const upper = normalized.toUpperCase();
    if (!CALL_STATUSES.includes(upper)) {
        throw new errorHandler_1.AppError('Invalid call status filter', 400);
    }
    return upper;
};
const getDisposition = (value) => {
    if (typeof value !== 'string' || !CALL_DISPOSITIONS.includes(value)) {
        throw new errorHandler_1.AppError('Invalid disposition', 400);
    }
    return value;
};
const listCalls = async (req, res, next) => {
    try {
        const result = await CallService.listCalls({
            campaignId: getQueryNumber(req.query.campaignId),
            agentId: getQueryNumber(req.query.agentId),
            status: getQueryStatus(req.query.status),
            page: getQueryNumber(req.query.page),
            limit: getQueryNumber(req.query.limit),
            startDate: getQueryDate(req.query.startDate),
            endDate: getQueryDate(req.query.endDate),
        }, req.user);
        return (0, response_1.sendSuccess)(res, result, 'Calls fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.listCalls = listCalls;
const createCall = async (req, res, next) => {
    try {
        const remoteNumber = String(req.body.remoteNumber || req.body.phone || '').trim();
        if (!remoteNumber)
            throw new errorHandler_1.AppError('remoteNumber is required', 400);
        const startedAtRaw = typeof req.body.startedAt === 'string' ? req.body.startedAt : undefined;
        const startedAt = startedAtRaw ? new Date(startedAtRaw) : undefined;
        if (startedAt && Number.isNaN(startedAt.getTime()))
            throw new errorHandler_1.AppError('Invalid startedAt', 400);
        const call = await CallService.createSipCallLog({
            remoteNumber,
            direction: typeof req.body.direction === 'string' ? req.body.direction : 'outgoing',
            startedAt,
            agentId: req.user?.id,
        }, req.user);
        return (0, response_1.sendSuccess)(res, call, 'Call logged', 201);
    }
    catch (err) {
        return next(err);
    }
};
exports.createCall = createCall;
const getCallById = async (req, res, next) => {
    try {
        const callId = Number(req.params.id);
        if (!Number.isFinite(callId))
            throw new errorHandler_1.AppError('Invalid call id', 400);
        const call = await CallService.getCallById(callId, req.user);
        return (0, response_1.sendSuccess)(res, call, 'Call fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getCallById = getCallById;
const updateDisposition = async (req, res, next) => {
    try {
        const callId = Number(req.params.id);
        if (!Number.isFinite(callId))
            throw new errorHandler_1.AppError('Invalid call id', 400);
        const call = await CallService.updateCallDisposition(callId, getDisposition(req.body.disposition), typeof req.body.notes === 'string' ? req.body.notes : undefined, req.user);
        return (0, response_1.sendSuccess)(res, call, 'Disposition updated');
    }
    catch (err) {
        return next(err);
    }
};
exports.updateDisposition = updateDisposition;
//# sourceMappingURL=call.controller.js.map