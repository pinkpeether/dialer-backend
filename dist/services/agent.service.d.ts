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
        email: string;
        agentCode: string | null;
        name: string;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.UserStatus;
        extension: string | null;
        phone: string | null;
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
    email: string;
    agentCode: string | null;
    name: string;
    role: import(".prisma/client").$Enums.UserRole;
    status: import(".prisma/client").$Enums.UserStatus;
    extension: string | null;
    phone: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    calls: {
        contact: {
            name: string | null;
            phone: string;
        };
        id: number;
        status: import(".prisma/client").$Enums.CallStatus;
        startedAt: Date;
        disposition: import(".prisma/client").$Enums.CallDisposition | null;
        duration: number | null;
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
    email: string;
    agentCode: string | null;
    name: string;
    role: import(".prisma/client").$Enums.UserRole;
    status: import(".prisma/client").$Enums.UserStatus;
    extension: string | null;
    phone: string | null;
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
    email: string;
    agentCode: string | null;
    name: string;
    role: import(".prisma/client").$Enums.UserRole;
    status: import(".prisma/client").$Enums.UserStatus;
    extension: string | null;
    phone: string | null;
    isActive: boolean;
    updatedAt: Date;
}>;
export declare const deleteAgent: (id: number) => Promise<void>;
export declare const updateAgentStatus: (id: number, status: "ONLINE" | "READY" | "BUSY" | "WRAP_UP" | "OFFLINE") => Promise<{
    id: number;
    agentCode: string | null;
    name: string;
    status: import(".prisma/client").$Enums.UserStatus;
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