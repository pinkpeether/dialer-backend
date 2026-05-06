export declare const initiateCall: (contactId: number, campaignId: number, agentId?: number) => Promise<{
    callRecord: {
        twilioCallSid: string;
        id: number;
        status: import(".prisma/client").$Enums.CallStatus;
        startedAt: Date;
        agentId: number | null;
        contactId: number;
        campaignId: number;
        duration: number | null;
        recordingUrl: string | null;
        recordingSid: string | null;
        transcript: string | null;
        sentiment: string | null;
        sentimentScore: number | null;
        disposition: import(".prisma/client").$Enums.DispositionType | null;
        dispositionNote: string | null;
        isWhispered: boolean;
        isBarged: boolean;
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