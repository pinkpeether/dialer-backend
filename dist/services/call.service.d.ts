import type { CallDisposition, CallStatus } from '@prisma/client';
type CallAccessUser = {
    id: number;
    role: string;
};
export type ListCallsFilters = {
    campaignId?: number;
    agentId?: number;
    status?: CallStatus;
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
};
export type SipCallLogInput = {
    remoteNumber: string;
    direction?: string;
    startedAt?: Date;
    agentId?: number;
};
export declare const createSipCallLog: (input: SipCallLogInput, user?: CallAccessUser) => Promise<{
    direction: string;
    remoteNumber: string;
    source: string;
    campaign: {
        id: number;
        name: string;
    };
    contact: {
        id: number;
        email: string | null;
        name: string | null;
        status: import(".prisma/client").$Enums.ContactStatus;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        campaignId: number | null;
        company: string | null;
        callbackAt: Date | null;
        notes: string | null;
        retryCount: number;
        maxRetries: number;
        lastCalledAt: Date | null;
    };
    agent: {
        id: number;
        agentCode: string | null;
        name: string;
    } | null;
    id: number;
    status: import(".prisma/client").$Enums.CallStatus;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date;
    contactId: number;
    campaignId: number;
    agentId: number | null;
    providerCallId: string | null;
    twilioCallSid: string | null;
    disposition: import(".prisma/client").$Enums.CallDisposition | null;
    duration: number | null;
    recordingUrl: string | null;
    recordingSid: string | null;
    connectedAt: Date | null;
    endedAt: Date | null;
}>;
export declare const listCalls: (filters: ListCallsFilters, user?: CallAccessUser) => Promise<{
    calls: ({
        campaign: {
            id: number;
            name: string;
        };
        contact: {
            id: number;
            email: string | null;
            name: string | null;
            status: import(".prisma/client").$Enums.ContactStatus;
            phone: string;
            createdAt: Date;
            updatedAt: Date;
            campaignId: number | null;
            company: string | null;
            callbackAt: Date | null;
            notes: string | null;
            retryCount: number;
            maxRetries: number;
            lastCalledAt: Date | null;
        };
        agent: {
            id: number;
            agentCode: string | null;
            name: string;
        } | null;
    } & {
        id: number;
        status: import(".prisma/client").$Enums.CallStatus;
        createdAt: Date;
        updatedAt: Date;
        startedAt: Date;
        contactId: number;
        campaignId: number;
        agentId: number | null;
        providerCallId: string | null;
        twilioCallSid: string | null;
        disposition: import(".prisma/client").$Enums.CallDisposition | null;
        duration: number | null;
        recordingUrl: string | null;
        recordingSid: string | null;
        connectedAt: Date | null;
        endedAt: Date | null;
    })[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>;
export declare const getCallById: (id: number, user?: CallAccessUser) => Promise<{
    campaign: {
        id: number;
        name: string;
    };
    contact: {
        id: number;
        email: string | null;
        name: string | null;
        status: import(".prisma/client").$Enums.ContactStatus;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        campaignId: number | null;
        company: string | null;
        callbackAt: Date | null;
        notes: string | null;
        retryCount: number;
        maxRetries: number;
        lastCalledAt: Date | null;
    };
    agent: {
        id: number;
        agentCode: string | null;
        name: string;
    } | null;
} & {
    id: number;
    status: import(".prisma/client").$Enums.CallStatus;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date;
    contactId: number;
    campaignId: number;
    agentId: number | null;
    providerCallId: string | null;
    twilioCallSid: string | null;
    disposition: import(".prisma/client").$Enums.CallDisposition | null;
    duration: number | null;
    recordingUrl: string | null;
    recordingSid: string | null;
    connectedAt: Date | null;
    endedAt: Date | null;
}>;
export declare const updateCallDisposition: (id: number, disposition: CallDisposition, notes?: string, user?: CallAccessUser) => Promise<{
    campaign: {
        id: number;
        name: string;
    };
    contact: {
        id: number;
        email: string | null;
        name: string | null;
        status: import(".prisma/client").$Enums.ContactStatus;
        phone: string;
        createdAt: Date;
        updatedAt: Date;
        campaignId: number | null;
        company: string | null;
        callbackAt: Date | null;
        notes: string | null;
        retryCount: number;
        maxRetries: number;
        lastCalledAt: Date | null;
    };
    agent: {
        id: number;
        agentCode: string | null;
        name: string;
    } | null;
} & {
    id: number;
    status: import(".prisma/client").$Enums.CallStatus;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date;
    contactId: number;
    campaignId: number;
    agentId: number | null;
    providerCallId: string | null;
    twilioCallSid: string | null;
    disposition: import(".prisma/client").$Enums.CallDisposition | null;
    duration: number | null;
    recordingUrl: string | null;
    recordingSid: string | null;
    connectedAt: Date | null;
    endedAt: Date | null;
}>;
export {};
//# sourceMappingURL=call.service.d.ts.map