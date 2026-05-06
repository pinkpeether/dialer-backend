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
        name: string | null;
        phone: string;
        status: string;
        createdAt: Date;
        _count: {
            calls: number;
        };
        campaignId: number | null;
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
    } | null;
    calls: {
        id: number;
        status: string;
        startedAt: Date;
        duration: number | null;
        disposition: string | null;
        sentiment: string | null;
        recordingUrl: string | null;
        endedAt: Date | null;
        agent: {
            agentCode: string | null;
            name: string;
        } | null;
    }[];
} & {
    id: number;
    email: string | null;
    name: string | null;
    phone: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    campaignId: number | null;
    company: string | null;
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
    name: string | null;
    phone: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    campaignId: number | null;
    company: string | null;
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
    name: string | null;
    phone: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    campaignId: number | null;
    company: string | null;
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
    createdAt: Date;
    reason: string | null;
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