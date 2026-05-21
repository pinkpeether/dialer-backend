export declare const getAllCampaigns: (filters: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
}) => Promise<{
    campaigns: {
        stats: {
            pending: number;
            answered: number;
            missed: number;
            active: number;
        };
        _count: {
            calls: number;
            contacts: number;
        };
        description: string | null;
        id: number;
        name: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        createdAt: Date;
        updatedAt: Date;
        maxRetries: number;
        callerId: string;
        dialingRatio: number;
        retryDelay: number;
        script: string | null;
        startTime: string | null;
        endTime: string | null;
        timezone: string;
    }[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>;
export declare const getCampaignById: (id: number) => Promise<{
    stats: {
        pending: number;
        answered: number;
        missed: number;
        active: number;
        total: number;
        answerRate: number;
    };
    _count: {
        calls: number;
        contacts: number;
    };
    description: string | null;
    id: number;
    name: string;
    status: import(".prisma/client").$Enums.CampaignStatus;
    createdAt: Date;
    updatedAt: Date;
    maxRetries: number;
    callerId: string;
    dialingRatio: number;
    retryDelay: number;
    script: string | null;
    startTime: string | null;
    endTime: string | null;
    timezone: string;
}>;
export declare const createCampaign: (data: {
    name: string;
    description?: string;
    callerId?: string;
    dialingRatio?: number;
    maxRetries?: number;
    retryDelay?: number;
    script?: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
}) => Promise<{
    description: string | null;
    id: number;
    name: string;
    status: import(".prisma/client").$Enums.CampaignStatus;
    createdAt: Date;
    updatedAt: Date;
    maxRetries: number;
    callerId: string;
    dialingRatio: number;
    retryDelay: number;
    script: string | null;
    startTime: string | null;
    endTime: string | null;
    timezone: string;
}>;
export declare const updateCampaign: (id: number, data: Partial<{
    name: string;
    description: string;
    callerId: string;
    dialingRatio: number;
    maxRetries: number;
    retryDelay: number;
    script: string;
    startTime: string;
    endTime: string;
    timezone: string;
}>) => Promise<{
    description: string | null;
    id: number;
    name: string;
    status: import(".prisma/client").$Enums.CampaignStatus;
    createdAt: Date;
    updatedAt: Date;
    maxRetries: number;
    callerId: string;
    dialingRatio: number;
    retryDelay: number;
    script: string | null;
    startTime: string | null;
    endTime: string | null;
    timezone: string;
}>;
export declare const deleteCampaign: (id: number) => Promise<void>;
export declare const updateCampaignStatus: (id: number, status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED") => Promise<{
    description: string | null;
    id: number;
    name: string;
    status: import(".prisma/client").$Enums.CampaignStatus;
    createdAt: Date;
    updatedAt: Date;
    maxRetries: number;
    callerId: string;
    dialingRatio: number;
    retryDelay: number;
    script: string | null;
    startTime: string | null;
    endTime: string | null;
    timezone: string;
}>;
export declare const cloneCampaign: (id: number) => Promise<{
    description: string | null;
    id: number;
    name: string;
    status: import(".prisma/client").$Enums.CampaignStatus;
    createdAt: Date;
    updatedAt: Date;
    maxRetries: number;
    callerId: string;
    dialingRatio: number;
    retryDelay: number;
    script: string | null;
    startTime: string | null;
    endTime: string | null;
    timezone: string;
}>;
export declare const getCampaignStats: () => Promise<{
    total: number;
    draft: number;
    active: number;
    paused: number;
    completed: number;
}>;
//# sourceMappingURL=campaign.service.d.ts.map