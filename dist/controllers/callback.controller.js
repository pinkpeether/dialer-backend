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
exports.updateCallback = exports.createCallback = exports.getAllCallbacks = void 0;
const CallbackService = __importStar(require("../services/callback.service"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const VALID_STATUSES = ['PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED'];
const getAllCallbacks = async (req, res, next) => {
    try {
        const { status, from, to, page, limit } = req.query;
        if (status && !VALID_STATUSES.includes(status)) {
            throw new errorHandler_1.AppError('Invalid status filter', 400);
        }
        // Agents see only their own callbacks; admins/supervisors see all
        const agentId = req.user?.role === 'AGENT' ? req.user.id : undefined;
        const result = await CallbackService.getAllCallbacks({
            status: status,
            from: typeof from === 'string' ? from : undefined,
            to: typeof to === 'string' ? to : undefined,
            agentId,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 30,
        });
        return (0, response_1.sendSuccess)(res, result, 'Callbacks fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getAllCallbacks = getAllCallbacks;
const createCallback = async (req, res, next) => {
    try {
        const { contactId, callId, scheduledAt, notes } = req.body;
        if (!scheduledAt)
            throw new errorHandler_1.AppError('scheduledAt is required', 400);
        const callback = await CallbackService.createCallback({
            contactId: contactId ? Number(contactId) : null,
            callId: callId ? Number(callId) : null,
            agentId: req.user.id,
            scheduledAt: String(scheduledAt),
            notes: typeof notes === 'string' ? notes : null,
        });
        return (0, response_1.sendSuccess)(res, callback, 'Callback scheduled', 201);
    }
    catch (err) {
        return next(err);
    }
};
exports.createCallback = createCallback;
const updateCallback = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id))
            throw new errorHandler_1.AppError('Invalid callback id', 400);
        const { status, scheduledAt, notes } = req.body;
        if (status && !VALID_STATUSES.includes(status)) {
            throw new errorHandler_1.AppError('Invalid status', 400);
        }
        const updated = await CallbackService.updateCallback(id, { status, scheduledAt, notes }, req.user.id);
        return (0, response_1.sendSuccess)(res, updated, 'Callback updated');
    }
    catch (err) {
        return next(err);
    }
};
exports.updateCallback = updateCallback;
//# sourceMappingURL=callback.controller.js.map