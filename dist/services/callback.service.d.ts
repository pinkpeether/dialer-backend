import type { CallbackStatus } from '@prisma/client';
export declare const createCallback: (data: {
    contactId?: number | null;
    callId?: number | null;
    agentId: number;
    scheduledAt: string;
    notes?: string | null;
}) => Promise<{
    contact: {
        id: number;
        name: string | null;
        phone: string;
    } | null;
    call: {
        id: number;
        status: import(".prisma/client").$Enums.CallStatus;
        disposition: import(".prisma/client").$Enums.CallDisposition | null;
    } | null;
    agent: {
        id: number;
        agentCode: string | null;
        name: string;
    };
} & {
    id: number;
    status: import(".prisma/client").$Enums.CallbackStatus;
    createdAt: Date;
    updatedAt: Date;
    contactId: number | null;
    agentId: number;
    notes: string | null;
    callId: number | null;
    scheduledAt: Date;
}>;
export declare const getAllCallbacks: (filters: {
    status?: CallbackStatus;
    from?: string;
    to?: string;
    agentId?: number;
    page?: number;
    limit?: number;
}) => Promise<{
    callbacks: ({
        contact: {
            id: number;
            name: string | null;
            phone: string;
        } | null;
        call: {
            id: number;
            status: import(".prisma/client").$Enums.CallStatus;
            disposition: import(".prisma/client").$Enums.CallDisposition | null;
        } | null;
        agent: {
            id: number;
            agentCode: string | null;
            name: string;
        };
    } & {
        id: number;
        status: import(".prisma/client").$Enums.CallbackStatus;
        createdAt: Date;
        updatedAt: Date;
        contactId: number | null;
        agentId: number;
        notes: string | null;
        callId: number | null;
        scheduledAt: Date;
    })[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>;
export declare const updateCallback: (id: number, data: {
    status?: CallbackStatus;
    scheduledAt?: string;
    notes?: string | null;
}, requestingUserId: number) => Promise<{
    contact: {
        id: number;
        name: string | null;
        phone: string;
    } | null;
    agent: {
        id: number;
        agentCode: string | null;
        name: string;
    };
} & {
    id: number;
    status: import(".prisma/client").$Enums.CallbackStatus;
    createdAt: Date;
    updatedAt: Date;
    contactId: number | null;
    agentId: number;
    notes: string | null;
    callId: number | null;
    scheduledAt: Date;
}>;
//# sourceMappingURL=callback.service.d.ts.map