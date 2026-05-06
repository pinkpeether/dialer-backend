export declare const getAllAgents: (filters: {
    role?: string;
    status?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
}) => Promise<{
    agents: {
        id: number;
        agentCode: string;
        email: string;
        name: string;
        extension: string | null;
        phone: string | null;
        role: import(".prisma/client").$Enums.Role;
        status: import(".prisma/client").$Enums.AgentStatus;
        isActive: boolean;
        createdAt: Date;
        _count: {
            calls: number;
        };
    }[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>;
export declare const getAgentById: (id: number) => Promise<{
    id: number;
    agentCode: string;
    email: string;
    name: string;
    extension: string | null;
    phone: string | null;
    role: import(".prisma/client").$Enums.Role;
    status: import(".prisma/client").$Enums.AgentStatus;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    calls: {
        contact: {
            name: string;
            phone: string;
        };
        id: number;
        status: import(".prisma/client").$Enums.CallStatus;
        startedAt: Date;
        duration: number | null;
        disposition: import(".prisma/client").$Enums.DispositionType | null;
    }[];
    _count: {
        calls: number;
    };
}>;
export declare const createAgent: (data: {
    name: string;
    email: string;
    password: string;
    role?: "ADMIN" | "SUPERVISOR" | "AGENT";
    extension?: string;
    phone?: string;
}) => Promise<{
    id: number;
    agentCode: string;
    email: string;
    name: string;
    extension: string | null;
    phone: string | null;
    role: import(".prisma/client").$Enums.Role;
    status: import(".prisma/client").$Enums.AgentStatus;
    isActive: boolean;
    createdAt: Date;
}>;
export declare const updateAgent: (id: number, data: {
    name?: string;
    email?: string;
    role?: "ADMIN" | "SUPERVISOR" | "AGENT";
    extension?: string;
    phone?: string;
    isActive?: boolean;
}) => Promise<{
    id: number;
    agentCode: string;
    email: string;
    name: string;
    extension: string | null;
    phone: string | null;
    role: import(".prisma/client").$Enums.Role;
    status: import(".prisma/client").$Enums.AgentStatus;
    isActive: boolean;
    updatedAt: Date;
}>;
export declare const deleteAgent: (id: number) => Promise<void>;
export declare const updateAgentStatus: (id: number, status: "ONLINE" | "READY" | "BUSY" | "WRAP_UP" | "OFFLINE") => Promise<{
    id: number;
    agentCode: string;
    name: string;
    status: import(".prisma/client").$Enums.AgentStatus;
}>;
export declare const resetAgentPassword: (id: number, newPassword: string) => Promise<void>;
export declare const getAgentStats: () => Promise<{
    total: number;
    online: number;
    ready: number;
    busy: number;
    wrapUp: number;
    offline: number;
}>;
//# sourceMappingURL=agent.service.d.ts.map