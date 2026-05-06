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
    user: any;
    token: string;
}>;
export declare const loginUser: (email: string, password: string) => Promise<{
    user: {
        id: any;
        agentCode: any;
        name: any;
        email: any;
        role: any;
        extension: any;
        phone: any;
        status: string;
    };
    token: string;
}>;
export declare const getProfile: (userId: number) => Promise<any>;
export declare const logoutUser: (userId: number) => Promise<void>;
export declare const seedAdmin: () => Promise<void>;
//# sourceMappingURL=auth.service.d.ts.map