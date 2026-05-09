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
const express_1 = require("express");
const DialerController = __importStar(require("../controllers/dialer.controller"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ── Protected routes ──
router.use('/token', auth_1.authenticate);
router.use('/start', auth_1.authenticate);
router.use('/stop', auth_1.authenticate);
router.use('/active', auth_1.authenticate);
router.use('/call/manual', auth_1.authenticate);
router.use('/call/adhoc', auth_1.authenticate);
router.use('/call/hangup', auth_1.authenticate);
router.use('/call/dtmf', auth_1.authenticate);
// Agent softphone token
router.get('/token', DialerController.getAccessToken);
// Campaign control
router.post('/start/:campaignId', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), DialerController.startCampaign);
router.post('/stop/:campaignId', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), DialerController.stopCampaign);
router.get('/active', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), DialerController.getActiveCampaigns);
// Manual call (requires contactId + campaignId)
router.post('/call/manual', DialerController.makeManualCall);
// Ad-hoc call (direct phone number — no contact/campaign required)
router.post('/call/adhoc', DialerController.makeAdhocCall);
// DTMF — send keypad digits to active call
router.post('/call/dtmf', DialerController.sendDTMF);
// Hangup
router.post('/call/hangup', DialerController.hangupCall);
// ── Twilio TwiML endpoints (no auth — Twilio calls these) ──
router.post('/twiml/connect/:callId', DialerController.twimlConnect);
router.post('/twiml/agent/:agentId', DialerController.twimlAgent);
// ── Twilio Webhooks (no auth — Twilio calls these) ──
router.post('/webhook/status/:callId', DialerController.webhookStatus);
router.post('/webhook/recording/:callId', DialerController.webhookRecording);
router.post('/webhook/amd/:callId', DialerController.webhookAMD);
exports.default = router;
//# sourceMappingURL=dialer.js.map