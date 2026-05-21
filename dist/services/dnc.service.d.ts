export declare const getAllDnc: (filters: {
    page?: number;
    limit?: number;
    search?: string;
}) => Promise<{
    entries: {
        id: number;
        phone: string;
        createdAt: Date;
        reason: string | null;
        addedBy: {
            id: number;
            agentCode: string | null;
            name: string;
        } | null;
    }[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>;
export declare const checkDnc: (phone: string) => Promise<boolean>;
export declare const addToDnc: (phone: string, reason: string | undefined, addedByUserId: number) => Promise<{
    id: number;
    phone: string;
    createdAt: Date;
    reason: string | null;
    addedBy: {
        id: number;
        name: string;
    } | null;
}>;
export declare const removeFromDnc: (id: number) => Promise<void>;
//# sourceMappingURL=dnc.service.d.ts.map