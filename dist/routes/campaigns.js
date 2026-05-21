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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const CampaignController = __importStar(require("../controllers/campaign.controller"));
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const campaign_validator_1 = require("../validators/campaign.validator");
const joi_1 = __importDefault(require("joi"));
const queueManager_1 = require("../services/queueManager");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Stats
router.get('/stats', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), CampaignController.getCampaignStats);
// List all
router.get('/', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), CampaignController.getAllCampaigns);
// Single campaign
router.get('/:id', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), CampaignController.getCampaignById);
// Create
router.post('/', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), (0, validate_1.validate)(campaign_validator_1.createCampaignSchema), CampaignController.createCampaign);
// Update
router.put('/:id', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), (0, validate_1.validate)(campaign_validator_1.updateCampaignSchema), CampaignController.updateCampaign);
// Delete
router.delete('/:id', (0, auth_1.authorize)('ADMIN'), CampaignController.deleteCampaign);
// Status change (start/pause/complete)
router.patch('/:id/status', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), (0, validate_1.validate)(joi_1.default.object({
    status: joi_1.default.string()
        .valid('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')
        .required(),
})), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        // When campaign is started (ACTIVE) → init queue
        if (status === 'ACTIVE') {
            await queueManager_1.queueManager.initQueue(parseInt(id, 10));
        }
        // When campaign is paused or completed → clear queue + reset contacts
        if (status === 'PAUSED' || status === 'COMPLETED') {
            await queueManager_1.queueManager.clear(parseInt(id, 10));
        }
        return CampaignController.updateCampaignStatus(req, res, next);
    }
    catch (err) {
        next(err);
    }
});
// Clone campaign
router.post('/:id/clone', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), CampaignController.cloneCampaign);
exports.default = router;
//# sourceMappingURL=campaigns.js.map