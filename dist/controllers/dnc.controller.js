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
exports.removeFromDnc = exports.addToDnc = exports.checkDnc = exports.getAllDnc = void 0;
const DncService = __importStar(require("../services/dnc.service"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const getAllDnc = async (req, res, next) => {
    try {
        const { page, limit, search } = req.query;
        const result = await DncService.getAllDnc({
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 50,
            search: typeof search === 'string' ? search.trim() : undefined,
        });
        return (0, response_1.sendSuccess)(res, result, 'DNC list fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getAllDnc = getAllDnc;
const checkDnc = async (req, res, next) => {
    try {
        const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
        if (!phone)
            throw new errorHandler_1.AppError('phone query param required', 400);
        const isDnc = await DncService.checkDnc(phone);
        return (0, response_1.sendSuccess)(res, { isDnc }, 'DNC check complete');
    }
    catch (err) {
        return next(err);
    }
};
exports.checkDnc = checkDnc;
const addToDnc = async (req, res, next) => {
    try {
        const { phone, reason } = req.body;
        if (!phone || typeof phone !== 'string')
            throw new errorHandler_1.AppError('phone is required', 400);
        const entry = await DncService.addToDnc(phone, typeof reason === 'string' ? reason : undefined, req.user.id);
        return (0, response_1.sendSuccess)(res, entry, 'Phone added to DNC list', 201);
    }
    catch (err) {
        return next(err);
    }
};
exports.addToDnc = addToDnc;
const removeFromDnc = async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id))
            throw new errorHandler_1.AppError('Invalid DNC entry id', 400);
        await DncService.removeFromDnc(id);
        return (0, response_1.sendSuccess)(res, null, 'Phone removed from DNC list');
    }
    catch (err) {
        return next(err);
    }
};
exports.removeFromDnc = removeFromDnc;
//# sourceMappingURL=dnc.controller.js.map