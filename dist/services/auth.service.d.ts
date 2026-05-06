export declare const generateToken: (payload: {
    id: number;
    email: string;
    role: string;
}) => string;
export declare const registerUser: (data: {
    name: string;
    email: string;
    password: string;
    role?: "ADMIN" | "SUPERVISOR" | "AGENT";
    extension?: string;
    phone?: string;
}) => Promise<{
    user: {
        id: number;
        email: string;
        agentCode: string | null;
        name: string;
        extension: string | null;
        phone: string | null;
        role: string;
        status: string;
        createdAt: Date;
    };
    token: string;
}>;
export declare const loginUser: (email: string, password: string) => Promise<{
    user: {
        id: number;
        agentCode: string | null;
        name: string;
        email: string;
        role: string;
        extension: string | null;
        phone: string | null;
        status: string;
    };
    token: string;
}>;
export declare const getProfile: (userId: number) => Promise<{
    id: number;
    email: string;
    agentCode: string | null;
    name: string;
    extension: string | null;
    phone: string | null;
    isActive: boolean;
    role: string;
    status: string;
    createdAt: Date;
}>;
export declare const logoutUser: (userId: number) => Promise<void>;
export declare const seedAdmin: () => Promise<void>;
//# sourceMappingURL=auth.service.d.ts.map