"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAMDWebhook = exports.handleRecordingWebhook = exports.handleStatusWebhook = exports.generateAccessToken = exports.generateWhisperTwiML = exports.generateAgentTwiML = exports.generateConnectTwiML = exports.hangupCall = exports.initiateCall = void 0;
const twilio_1 = __importDefault(require("twilio"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = __importDefault(require("../utils/logger"));
const client = (0, twilio_1.default)(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
// ── Initiate outbound call ──
const initiateCall = async (contactId, campaignId, agentId) => {
    const contact = await prisma_1.default.contact.findUnique({ where: { id: contactId } });
    if (!contact)
        throw new errorHandler_1.AppError('Contact not found', 404);
    const campaign = await prisma_1.default.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign)
        throw new errorHandler_1.AppError('Campaign not found', 404);
    const callRecord = await prisma_1.default.call.create({
        data: { contactId, campaignId, agentId: agentId || null, status: 'INITIATED' }
    });
    await prisma_1.default.contact.update({
        where: { id: contactId },
        data: { status: 'CALLING', lastCalledAt: new Date() }
    });
    try {
        const call = await client.calls.create({
            to: contact.phone,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${BASE_URL}/api/dialer/twiml/connect/${callRecord.id}`,
            statusCallback: `${BASE_URL}/api/dialer/webhook/status/${callRecord.id}`,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            record: true,
            recordingStatusCallback: `${BASE_URL}/api/dialer/webhook/recording/${callRecord.id}`,
            recordingStatusCallbackMethod: 'POST',
            machineDetection: 'Enable',
            asyncAmdStatusCallback: `${BASE_URL}/api/dialer/webhook/amd/${callRecord.id}`,
            asyncAmdStatusCallbackMethod: 'POST',
        });
        await prisma_1.default.call.update({
            where: { id: callRecord.id },
            data: { twilioCallSid: call.sid, status: 'RINGING' }
        });
        logger_1.default.info(`📞 Call initiated: ${call.sid} → ${contact.phone}`);
        return { callRecord: { ...callRecord, twilioCallSid: call.sid }, twilioCall: call };
    }
    catch (err) {
        await prisma_1.default.call.update({ where: { id: callRecord.id }, data: { status: 'FAILED' } });
        await prisma_1.default.contact.update({ where: { id: contactId }, data: { status: 'NO_ANSWER' } });
        throw err;
    }
};
exports.initiateCall = initiateCall;
// ── Hangup a call ──
const hangupCall = async (twilioCallSid) => {
    await client.calls(twilioCallSid).update({ status: 'completed' });
    logger_1.default.info(`📵 Call hung up: ${twilioCallSid}`);
};
exports.hangupCall = hangupCall;
// ── Generate TwiML to connect agent ──
const generateConnectTwiML = (callId, agentId) => {
    const VoiceResponse = twilio_1.default.twiml.VoiceResponse;
    const response = new VoiceResponse();
    if (agentId) {
        const dial = response.dial({ timeout: '30', record: 'record-from-answer' });
        dial
            .conference(`agent-${agentId}`, {
            startConferenceOnEnter: true,
            endConferenceOnExit: true,
            waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
        });
    }
    else {
        response.say({ voice: 'alice', language: 'en-US' }, 'Hello, please leave a message after the beep.');
        response.record({ maxLength: 30, playBeep: true });
        response.hangup();
    }
    return response.toString();
};
exports.generateConnectTwiML = generateConnectTwiML;
// ── Generate TwiML for agent browser (softphone) ──
const generateAgentTwiML = (agentId) => {
    const VoiceResponse = twilio_1.default.twiml.VoiceResponse;
    const response = new VoiceResponse();
    const dial = response.dial();
    dial
        .conference(`agent-${agentId}`, {
        startConferenceOnEnter: false,
        endConferenceOnExit: true,
    });
    return response.toString();
};
exports.generateAgentTwiML = generateAgentTwiML;
// ── Whisper TwiML (supervisor listens silently) ──
const generateWhisperTwiML = (conferenceRoom) => {
    const VoiceResponse = twilio_1.default.twiml.VoiceResponse;
    const response = new VoiceResponse();
    const dial = response.dial();
    dial
        .conference(conferenceRoom, {
        startConferenceOnEnter: false,
        endConferenceOnExit: false,
        muted: true,
    });
    return response.toString();
};
exports.generateWhisperTwiML = generateWhisperTwiML;
// ── Generate Twilio Access Token ──
const generateAccessToken = (agentId, _agentName) => {
    const AccessToken = twilio_1.default.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;
    const token = new AccessToken(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_API_KEY || process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN, { identity: `agent_${agentId}` });
    const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID || '',
        incomingAllow: true,
    });
    token.addGrant(voiceGrant);
    return token.toJwt();
};
exports.generateAccessToken = generateAccessToken;
// ── Handle call status webhook ──
const handleStatusWebhook = async (callId, data) => {
    const statusMap = {
        initiated: 'INITIATED',
        ringing: 'RINGING',
        'in-progress': 'CONNECTED',
        completed: 'COMPLETED',
        busy: 'BUSY',
        'no-answer': 'NO_ANSWER',
        failed: 'FAILED',
        canceled: 'FAILED',
    };
    const status = statusMap[data.CallStatus] || 'FAILED';
    const duration = data.CallDuration ? parseInt(data.CallDuration) : null;
    await prisma_1.default.call.update({
        where: { id: callId },
        data: {
            status: status,
            duration,
            endedAt: ['COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED'].includes(status) ? new Date() : undefined,
            connectedAt: status === 'CONNECTED' ? new Date() : undefined,
        }
    });
    const call = await prisma_1.default.call.findUnique({
        where: { id: callId },
        select: { contactId: true, contact: { select: { retryCount: true, campaignId: true } } }
    });
    if (!call)
        return;
    const contactStatusMap = {
        COMPLETED: 'DONE',
        BUSY: 'BUSY',
        NO_ANSWER: 'NO_ANSWER',
        FAILED: 'NO_ANSWER',
        CONNECTED: 'ANSWERED',
    };
    const newContactStatus = contactStatusMap[status];
    if (newContactStatus) {
        await prisma_1.default.contact.update({
            where: { id: call.contactId },
            data: { status: newContactStatus }
        });
    }
    logger_1.default.info(`📊 Call ${callId} status: ${status} (${duration}s)`);
};
exports.handleStatusWebhook = handleStatusWebhook;
// ── Handle recording webhook ──
const handleRecordingWebhook = async (callId, data) => {
    await prisma_1.default.call.update({
        where: { id: callId },
        data: { recordingUrl: data.RecordingUrl + '.mp3', recordingSid: data.RecordingSid }
    });
    logger_1.default.info(`🎙️ Recording saved for call ${callId}: ${data.RecordingSid}`);
};
exports.handleRecordingWebhook = handleRecordingWebhook;
// ── Handle AMD webhook ──
const handleAMDWebhook = async (callId, data) => {
    const isVoicemail = data.AnsweredBy === 'machine_start' ||
        data.AnsweredBy === 'machine_end_beep';
    if (isVoicemail) {
        logger_1.default.info(`🤖 Voicemail detected for call ${callId} — hanging up`);
        const call = await prisma_1.default.call.findUnique({
            where: { id: callId },
            select: { twilioCallSid: true }
        });
        if (call?.twilioCallSid)
            await (0, exports.hangupCall)(call.twilioCallSid);
        await prisma_1.default.call.update({
            where: { id: callId },
            data: { status: 'VOICEMAIL' }
        });
    }
};
exports.handleAMDWebhook = handleAMDWebhook;
//# sourceMappingURL=twilio.service.js.map