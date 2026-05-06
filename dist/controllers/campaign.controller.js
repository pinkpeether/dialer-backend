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
exports.getCampaignStats = exports.cloneCampaign = exports.updateCampaignStatus = exports.deleteCampaign = exports.updateCampaign = exports.createCampaign = exports.getCampaignById = exports.getAllCampaigns = void 0;
const CampaignService = __importStar(require("../services/campaign.service"));
const response_1 = require("../utils/response");
const getAllCampaigns = async (req, res, next) => {
    try {
        const { status, search, page, limit } = req.query;
        const result = await CampaignService.getAllCampaigns({
            status: status,
            search: search,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 20,
        });
        return (0, response_1.sendSuccess)(res, result, 'Campaigns fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getAllCampaigns = getAllCampaigns;
const getCampaignById = async (req, res, next) => {
    try {
        const campaign = await CampaignService.getCampaignById(Number(req.params.id));
        return (0, response_1.sendSuccess)(res, campaign, 'Campaign fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getCampaignById = getCampaignById;
const createCampaign = async (req, res, next) => {
    try {
        const campaign = await CampaignService.createCampaign(req.body);
        return (0, response_1.sendSuccess)(res, campaign, 'Campaign created successfully', 201);
    }
    catch (err) {
        return next(err);
    }
};
exports.createCampaign = createCampaign;
const updateCampaign = async (req, res, next) => {
    try {
        const campaign = await CampaignService.updateCampaign(Number(req.params.id), req.body);
        return (0, response_1.sendSuccess)(res, campaign, 'Campaign updated successfully');
    }
    catch (err) {
        return next(err);
    }
};
exports.updateCampaign = updateCampaign;
const deleteCampaign = async (req, res, next) => {
    try {
        await CampaignService.deleteCampaign(Number(req.params.id));
        return (0, response_1.sendSuccess)(res, null, 'Campaign deleted successfully');
    }
    catch (err) {
        return next(err);
    }
};
exports.deleteCampaign = deleteCampaign;
const updateCampaignStatus = async (req, res, next) => {
    try {
        const campaign = await CampaignService.updateCampaignStatus(Number(req.params.id), req.body.status);
        return (0, response_1.sendSuccess)(res, campaign, `Campaign ${req.body.status.toLowerCase()} successfully`);
    }
    catch (err) {
        return next(err);
    }
};
exports.updateCampaignStatus = updateCampaignStatus;
const cloneCampaign = async (req, res, next) => {
    try {
        const campaign = await CampaignService.cloneCampaign(Number(req.params.id));
        return (0, response_1.sendSuccess)(res, campaign, 'Campaign cloned successfully', 201);
    }
    catch (err) {
        return next(err);
    }
};
exports.cloneCampaign = cloneCampaign;
const getCampaignStats = async (req, res, next) => {
    try {
        const stats = await CampaignService.getCampaignStats();
        return (0, response_1.sendSuccess)(res, stats, 'Campaign stats fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getCampaignStats = getCampaignStats;
//# sourceMappingURL=campaign.controller.js.map