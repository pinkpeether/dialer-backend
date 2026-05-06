export declare const getAllAgents: (filters: {
    role?: string;
    status?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
}) => Promise<{
    agents: any;
    pagination: {
        total: any;
        page: number;
        limit: number;
        totalPages: number;
    };
}>;
export declare const getAgentById: (id: number) => Promise<any>;
export declare const createAgent: (data: {
    name: string;
    email: string;
    password: string;
    role?: "ADMIN" | "SUPERVISOR" | "AGENT";
    extension?: string;
    phone?: string;
}) => Promise<any>;
export declare const updateAgent: (id: number, data: {
    name?: string;
    email?: string;
    role?: "ADMIN" | "SUPERVISOR" | "AGENT";
    extension?: string;
    phone?: string;
    isActive?: boolean;
}) => Promise<any>;
export declare const deleteAgent: (id: number) => Promise<void>;
export declare const updateAgentStatus: (id: number, status: "ONLINE" | "READY" | "BUSY" | "WRAP_UP" | "OFFLINE") => Promise<any>;
export declare const resetAgentPassword: (id: number, newPassword: string) => Promise<void>;
export declare const getAgentStats: () => Promise<{
    total: any;
    online: any;
    ready: any;
    busy: any;
    wrapUp: any;
    offline: any;
}>;
//# sourceMappingURL=agent.service.d.ts.map