"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwilioProvider = void 0;
const twilio_1 = __importDefault(require("twilio"));
class TwilioProvider {
    constructor() {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        this.from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || '';
        this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.BASE_URL || '';
        if (!accountSid || !authToken) {
            throw new Error('Twilio credentials not configured');
        }
        if (!this.from) {
            throw new Error('TWILIO_FROM_NUMBER or TWILIO_PHONE_NUMBER must be set');
        }
        this.client = (0, twilio_1.default)(accountSid, authToken);
    }
    async startOutboundCall(to, from, metadata = {}) {
        const callerId = from || this.from;
        const call = await this.client.calls.create({
            to,
            from: callerId,
            url: `${this.webhookBaseUrl}/webhooks/twilio/voice`,
            statusCallback: `${this.webhookBaseUrl}/webhooks/twilio/status`,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            record: true,
        });
        return {
            callId: metadata.callId ?? call.sid,
            providerCallId: call.sid,
            status: 'INITIATED',
        };
    }
    async hangupCall(callId) {
        await this.client.calls(callId).update({ status: 'completed' });
    }
    async muteCall(callId) {
        try {
            await this.client.calls(callId).update({ muted: true });
        }
        catch {
            // mute not supported on all Twilio call states
        }
    }
    async unmuteCall(callId) {
        try {
            await this.client.calls(callId).update({ muted: false });
        }
        catch {
            // unmute not supported on all Twilio call states
        }
    }
    async getCallStatus(callId) {
        const call = await this.client.calls(callId).fetch();
        const statusMap = {
            queued: 'INITIATED',
            initiated: 'INITIATED',
            ringing: 'RINGING',
            'in-progress': 'ANSWERED',
            completed: 'COMPLETED',
            busy: 'FAILED',
            'no-answer': 'NO_ANSWER',
            failed: 'FAILED',
            canceled: 'FAILED',
        };
        return statusMap[call.status] || 'FAILED';
    }
}
exports.TwilioProvider = TwilioProvider;
//# sourceMappingURL=TwilioProvider.js.map