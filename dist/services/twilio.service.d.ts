export declare const initiateCall: (contactId: number, campaignId: number, agentId?: number) => Promise<{
    callRecord: {
        twilioCallSid: string;
        id: number;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        startedAt: Date;
        contactId: number;
        campaignId: number;
        agentId: number | null;
        duration: number | null;
        disposition: string | null;
        sentiment: string | null;
        recordingUrl: string | null;
        recordingSid: string | null;
        connectedAt: Date | null;
        endedAt: Date | null;
    };
    twilioCall: import("twilio/lib/rest/api/v2010/account/call").CallInstance;
}>;
export declare const initiateAdhocCall: (phone: string, agentId: number, note?: string) => Promise<{
    callSid: string;
    callId: number;
    contactId: number;
    phone: string;
}>;
export declare const hangupCall: (twilioCallSid: string) => Promise<void>;
export declare const sendDTMF: (twilioCallSid: string, digits: string) => Promise<void>;
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