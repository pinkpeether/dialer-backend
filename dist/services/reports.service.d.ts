export declare const getSummary: (filters: {
    from?: Date;
    to?: Date;
    campaignId?: number;
    agentId?: number;
}) => Promise<{
    totalCalls: number;
    answered: number;
    noAnswer: number;
    voicemail: number;
    callback: number;
    dnc: number;
    wrongNumber: number;
    failed: number;
    totalTalkTimeSecs: number;
    answerRate: number;
}>;
export declare const getCallTrend: (filters: {
    from?: Date;
    to?: Date;
    granularity?: "day" | "week";
}) => Promise<{
    date: string;
    total: number;
    answered: number;
}[]>;
export declare const getCampaignBreakdown: (filters: {
    from?: Date;
    to?: Date;
}) => Promise<{
    id: number;
    name: string;
    status: import(".prisma/client").$Enums.CampaignStatus;
    totalContacts: number;
    totalCalls: number;
    answered: number;
    answerRate: number;
    totalTalkTimeSecs: number;
}[]>;
export declare const getAgentBreakdown: (filters: {
    from?: Date;
    to?: Date;
}) => Promise<{
    id: number;
    agentCode: string | null;
    name: string;
    status: import(".prisma/client").$Enums.UserStatus;
    totalCalls: number;
    answered: number;
    answerRate: number;
    totalTalkTimeSecs: number;
}[]>;
//# sourceMappingURL=reports.service.d.ts.map