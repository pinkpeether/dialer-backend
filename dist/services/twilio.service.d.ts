export declare const initiateCall: (contactId: number, campaignId: number, agentId?: number) => Promise<{
    callRecord: {
        twilioCallSid: string;
        status: string;
        id: number;
        createdAt: Date;
        updatedAt: Date;
        campaignId: number;
        contactId: number;
        agentId: number | null;
        duration: number | null;
        recordingUrl: string | null;
        recordingSid: string | null;
        connectedAt: Date | null;
        endedAt: Date | null;
    };
    twilioCall: import("twilio/lib/rest/api/v2010/account/call").CallInstance;
}>;
export declare const hangupCall: (twilioCallSid: string) => Promise<void>;
export declare const generateConnectTwiML: (callId: number, agentId?: number) => string;
export declare const generateAgentTwiML: (agentId: number) => string;
export declare const generateWhisperTwiML: (conferenceRoom: string) => string;
export declare const generateAccessToken: (agentId: number, _agentName: string) => string;
export declare const handleStatusWebhook: (callId: number, data: {
    CallStatus: string;
    CallDuration?: string;
    CallSid: string;
}) => Promise<void>;
export declare const handleRecordingWebhook: (callId: number, data: {
    RecordingUrl: string;
    RecordingSid: string;
}) => Promise<void>;
export declare const handleAMDWebhook: (callId: number, data: {
    AnsweredBy: string;
}) => Promise<void>;
//# sourceMappingURL=twilio.service.d.ts.map