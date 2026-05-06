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
            contacts: number;
            calls: number;
        };
        name: string;
        status: string;
        id: number;
        createdAt: Date;
        updatedAt: Date;
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
        contacts: number;
        calls: number;
    };
    name: string;
    status: string;
    id: number;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare const createCampaign: (data: {
    name: string;
    description?: string;
    dialRatio?: number;
    maxRetries?: number;
    retryDelay?: number;
    script?: string;
    startTime?: string;
    endTime?: string;
    timezone?: string;
}) => Promise<{
    name: string;
    status: string;
    id: number;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare const updateCampaign: (id: number, data: Partial<{
    name: string;
    description: string;
    dialRatio: number;
    maxRetries: number;
    retryDelay: number;
    script: string;
    startTime: string;
    endTime: string;
    timezone: string;
}>) => Promise<{
    name: string;
    status: string;
    id: number;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare const deleteCampaign: (id: number) => Promise<void>;
export declare const updateCampaignStatus: (id: number, status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED") => Promise<{
    name: string;
    status: string;
    id: number;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare const cloneCampaign: (id: number) => Promise<{
    name: string;
    status: string;
    id: number;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare const getCampaignStats: () => Promise<{
    total: number;
    draft: number;
    active: number;
    paused: number;
    completed: number;
}>;
//# sourceMappingURL=campaign.service.d.ts.map