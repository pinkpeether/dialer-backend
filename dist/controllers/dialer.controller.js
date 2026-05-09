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
exports.hangupCall = exports.sendDTMF = exports.makeAdhocCall = exports.makeManualCall = exports.webhookAMD = exports.webhookRecording = exports.webhookStatus = exports.twimlAgent = exports.twimlConnect = exports.getAccessToken = exports.getActiveCampaigns = exports.stopCampaign = exports.startCampaign = void 0;
const DialerService = __importStar(require("../services/dialer.service"));
const TwilioService = __importStar(require("../services/twilio.service"));
const response_1 = require("../utils/response");
const logger_1 = __importDefault(require("../utils/logger"));
// Start campaign dialing
const startCampaign = async (req, res, next) => {
    try {
        await DialerService.startCampaign(Number(req.params.campaignId));
        return (0, response_1.sendSuccess)(res, null, 'Campaign dialing started');
    }
    catch (err) {
        return next(err);
    }
};
exports.startCampaign = startCampaign;
// Stop campaign dialing
const stopCampaign = async (req, res, next) => {
    try {
        await DialerService.stopCampaign(Number(req.params.campaignId));
        return (0, response_1.sendSuccess)(res, null, 'Campaign dialing stopped');
    }
    catch (err) {
        return next(err);
    }
};
exports.stopCampaign = stopCampaign;
// Get active campaigns
const getActiveCampaigns = async (req, res, next) => {
    try {
        const campaigns = DialerService.getActiveCampaigns();
        return (0, response_1.sendSuccess)(res, { activeCampaigns: campaigns }, 'Active campaigns fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getActiveCampaigns = getActiveCampaigns;
// Generate Twilio access token for agent softphone
const getAccessToken = async (req, res, next) => {
    try {
        const token = TwilioService.generateAccessToken(req.user.id, req.user.email);
        return (0, response_1.sendSuccess)(res, { token }, 'Access token generated');
    }
    catch (err) {
        return next(err);
    }
};
exports.getAccessToken = getAccessToken;
// TwiML — connect customer to agent
const twimlConnect = async (req, res, next) => {
    try {
        const callId = Number(req.params.callId);
        const agentId = await DialerService.routeCallToAgent(callId);
        const twiml = TwilioService.generateConnectTwiML(callId, agentId || undefined);
        res.type('text/xml');
        return res.send(twiml);
    }
    catch (err) {
        return next(err);
    }
};
exports.twimlConnect = twimlConnect;
// TwiML — agent browser softphone
const twimlAgent = async (req, res, next) => {
    try {
        const agentId = Number(req.params.agentId);
        const twiml = TwilioService.generateAgentTwiML(agentId);
        res.type('text/xml');
        return res.send(twiml);
    }
    catch (err) {
        return next(err);
    }
};
exports.twimlAgent = twimlAgent;
// Webhook — call status update
const webhookStatus = async (req, res, next) => {
    try {
        const callId = Number(req.params.callId);
        await TwilioService.handleStatusWebhook(callId, req.body);
        return res.status(200).send('OK');
    }
    catch (err) {
        logger_1.default.error(`Webhook error: ${err}`);
        return res.status(200).send('OK');
    }
};
exports.webhookStatus = webhookStatus;
// Webhook — recording available
const webhookRecording = async (req, res, next) => {
    try {
        const callId = Number(req.params.callId);
        await TwilioService.handleRecordingWebhook(callId, req.body);
        return res.status(200).send('OK');
    }
    catch (err) {
        logger_1.default.error(`Recording webhook error: ${err}`);
        return res.status(200).send('OK');
    }
};
exports.webhookRecording = webhookRecording;
// Webhook — AMD (voicemail detection)
const webhookAMD = async (req, res, next) => {
    try {
        const callId = Number(req.params.callId);
        await TwilioService.handleAMDWebhook(callId, req.body);
        return res.status(200).send('OK');
    }
    catch (err) {
        logger_1.default.error(`AMD webhook error: ${err}`);
        return res.status(200).send('OK');
    }
};
exports.webhookAMD = webhookAMD;
// Manual call (campaign-based, contactId + campaignId required)
const makeManualCall = async (req, res, next) => {
    try {
        const { contactId, campaignId } = req.body;
        if (!contactId || !campaignId) {
            return (0, response_1.sendError)(res, 'contactId and campaignId required', 400);
        }
        const result = await TwilioService.initiateCall(Number(contactId), Number(campaignId), req.user.id);
        return (0, response_1.sendSuccess)(res, result, 'Call initiated');
    }
    catch (err) {
        return next(err);
    }
};
exports.makeManualCall = makeManualCall;
// Ad-hoc call — direct phone number, no contact/campaign needed
const makeAdhocCall = async (req, res, next) => {
    try {
        const { phone, note } = req.body;
        if (!phone)
            return (0, response_1.sendError)(res, 'phone number required', 400);
        const result = await TwilioService.initiateAdhocCall(String(phone).trim(), req.user.id, note ? String(note) : undefined);
        return (0, response_1.sendSuccess)(res, result, 'Ad-hoc call initiated');
    }
    catch (err) {
        return next(err);
    }
};
exports.makeAdhocCall = makeAdhocCall;
// Send DTMF digits to active call
const sendDTMF = async (req, res, next) => {
    try {
        const { twilioCallSid, digits } = req.body;
        if (!twilioCallSid || !digits)
            return (0, response_1.sendError)(res, 'twilioCallSid and digits required', 400);
        await TwilioService.sendDTMF(String(twilioCallSid), String(digits));
        return (0, response_1.sendSuccess)(res, null, 'DTMF sent');
    }
    catch (err) {
        return next(err);
    }
};
exports.sendDTMF = sendDTMF;
// Hangup call
const hangupCall = async (req, res, next) => {
    try {
        const { twilioCallSid } = req.body;
        if (!twilioCallSid)
            return (0, response_1.sendError)(res, 'twilioCallSid required', 400);
        await TwilioService.hangupCall(twilioCallSid);
        return (0, response_1.sendSuccess)(res, null, 'Call hung up');
    }
    catch (err) {
        return next(err);
    }
};
exports.hangupCall = hangupCall;
//# sourceMappingURL=dialer.controller.js.map