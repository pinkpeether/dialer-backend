export declare const getAllContacts: (filters: {
    campaignId?: number;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
}) => Promise<{
    contacts: {
        id: number;
        email: string | null;
        name: string;
        phone: string;
        status: import(".prisma/client").$Enums.ContactStatus;
        createdAt: Date;
        _count: {
            calls: number;
        };
        campaignId: number;
        company: string | null;
        retryCount: number;
        lastCalledAt: Date | null;
    }[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>;
export declare const getContactById: (id: number) => Promise<{
    campaign: {
        id: number;
        name: string;
    };
    calls: {
        id: number;
        status: import(".prisma/client").$Enums.CallStatus;
        startedAt: Date;
        duration: number | null;
        recordingUrl: string | null;
        sentiment: string | null;
        disposition: import(".prisma/client").$Enums.DispositionType | null;
        endedAt: Date | null;
        agent: {
            agentCode: string;
            name: string;
        } | null;
    }[];
} & {
    id: number;
    email: string | null;
    name: string;
    phone: string;
    status: import(".prisma/client").$Enums.ContactStatus;
    createdAt: Date;
    updatedAt: Date;
    campaignId: number;
    company: string | null;
    notes: string | null;
    retryCount: number;
    lastCalledAt: Date | null;
}>;
export declare const createContact: (data: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    notes?: string;
    campaignId: number;
}) => Promise<{
    id: number;
    email: string | null;
    name: string;
    phone: string;
    status: import(".prisma/client").$Enums.ContactStatus;
    createdAt: Date;
    updatedAt: Date;
    campaignId: number;
    company: string | null;
    notes: string | null;
    retryCount: number;
    lastCalledAt: Date | null;
}>;
export declare const updateContact: (id: number, data: Partial<{
    name: string;
    phone: string;
    email: string;
    company: string;
    notes: string;
    status: string;
}>) => Promise<{
    id: number;
    email: string | null;
    name: string;
    phone: string;
    status: import(".prisma/client").$Enums.ContactStatus;
    createdAt: Date;
    updatedAt: Date;
    campaignId: number;
    company: string | null;
    notes: string | null;
    retryCount: number;
    lastCalledAt: Date | null;
}>;
export declare const deleteContact: (id: number) => Promise<void>;
export declare const uploadCSV: (campaignId: number, fileBuffer: Buffer) => Promise<{
    imported: number;
    duplicates: number;
    dncSkipped: number;
    errors: number;
    total: number;
}>;
export declare const addToDNC: (phone: string, reason?: string) => Promise<{
    id: number;
    phone: string;
    reason: string | null;
    addedAt: Date;
}>;
export declare const getContactStats: (campaignId?: number) => Promise<{
    total: number;
    pending: number;
    calling: number;
    answered: number;
    noAnswer: number;
    busy: number;
    done: number;
    dnc: number;
    dialed: number;
    answerRate: number;
}>;
//# sourceMappingURL=contact.service.d.ts.map