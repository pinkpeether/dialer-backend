"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAMDWebhook = exports.handleRecordingWebhook = exports.handleStatusWebhook = exports.generateAccessToken = exports.generateWhisperTwiML = exports.generateAgentTwiML = exports.generateConnectTwiML = exports.sendDTMF = exports.hangupCall = exports.initiateAdhocCall = exports.initiateCall = void 0;
const twilio_1 = __importDefault(require("twilio"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = __importDefault(require("../utils/logger"));
const BASE_URL = process.env.WEBHOOK_BASE_URL || process.env.BASE_URL || 'http://localhost:3001';
const getTwilioFromNumber = () => process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || '';
// Legacy Twilio API adapter. Universal SIP mode lives in the frontend SIP engine;
// this file remains only for backwards-compatible API/TwiML workflows.
// Lazy getter — prevents startup crash if TWILIO_* env vars are missing
const getClient = () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token)
        throw new errorHandler_1.AppError('Twilio credentials not configured', 500);
    return (0, twilio_1.default)(sid, token);
};
// ── Initiate outbound call (campaign-based) ──
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
        const client = getClient();
        const call = await client.calls.create({
            to: contact.phone,
            from: getTwilioFromNumber(),
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
// ── Initiate ad-hoc call (direct phone number, no contact/campaign required) ──
const initiateAdhocCall = async (phone, agentId, note) => {
    // Create a minimal contact record for tracking
    const contact = await prisma_1.default.contact.create({
        data: {
            phone,
            name: note || 'Ad-hoc Call',
            status: 'CALLING',
            lastCalledAt: new Date(),
        }
    });
    // Find or create a default ad-hoc campaign
    let campaign = await prisma_1.default.campaign.findFirst({
        where: { name: '__adhoc__' }
    });
    if (!campaign) {
        campaign = await prisma_1.default.campaign.create({
            data: {
                name: '__adhoc__',
                description: 'System campaign for ad-hoc manual calls',
                status: 'ACTIVE',
                callerId: process.env.TWILIO_FROM_NUMBER ||
                    process.env.TWILIO_PHONE_NUMBER ||
                    'LEGACY_TWILIO',
                dialingRatio: 1,
            }
        });
    }
    const callRecord = await prisma_1.default.call.create({
        data: {
            contactId: contact.id,
            campaignId: campaign.id,
            agentId,
            status: 'INITIATED',
        }
    });
    try {
        const client = getClient();
        const call = await client.calls.create({
            to: phone,
            from: getTwilioFromNumber(),
            url: `${BASE_URL}/api/dialer/twiml/connect/${callRecord.id}`,
            statusCallback: `${BASE_URL}/api/dialer/webhook/status/${callRecord.id}`,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            record: true,
            recordingStatusCallback: `${BASE_URL}/api/dialer/webhook/recording/${callRecord.id}`,
            recordingStatusCallbackMethod: 'POST',
        });
        await prisma_1.default.call.update({
            where: { id: callRecord.id },
            data: { twilioCallSid: call.sid, status: 'RINGING' }
        });
        logger_1.default.info(`📞 Ad-hoc call initiated: ${call.sid} → ${phone}`);
        return {
            callSid: call.sid,
            callId: callRecord.id,
            contactId: contact.id,
            phone,
        };
    }
    catch (err) {
        await prisma_1.default.call.update({ where: { id: callRecord.id }, data: { status: 'FAILED' } });
        await prisma_1.default.contact.update({ where: { id: contact.id }, data: { status: 'NO_ANSWER' } });
        throw err;
    }
};
exports.initiateAdhocCall = initiateAdhocCall;
// ── Hangup a call ──
const hangupCall = async (twilioCallSid) => {
    const client = getClient();
    await client.calls(twilioCallSid).update({ status: 'completed' });
    logger_1.default.info(`📵 Call hung up: ${twilioCallSid}`);
};
exports.hangupCall = hangupCall;
// ── Send DTMF digits to active call ──
const sendDTMF = async (twilioCallSid, digits) => {
    const client = getClient();
    await client.calls(twilioCallSid).update({
        twiml: `<Response><Play digits="${digits}"/></Response>`,
    });
    logger_1.default.info(`🔢 DTMF sent to ${twilioCallSid}: ${digits}`);
};
exports.sendDTMF = sendDTMF;
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
        response.record({ maxLength: 30, playBeek: true });
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