import { CallProvider, CallResult, CallStatus } from '../interfaces/CallProvider';
export declare class TwilioProvider implements CallProvider {
    private client;
    private readonly from;
    private readonly webhookBaseUrl;
    constructor();
    startOutboundCall(to: string, from: string, metadata?: Record<string, any>): Promise<CallResult>;
    hangupCall(callId: string): Promise<void>;
    muteCall(callId: string): Promise<void>;
    unmuteCall(callId: string): Promise<void>;
    getCallStatus(callId: string): Promise<CallStatus>;
}
//# sourceMappingURL=TwilioProvider.d.ts.map