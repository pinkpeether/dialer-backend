"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentBreakdown = exports.getCampaignBreakdown = exports.getCallTrend = exports.getSummary = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const getSummary = async (filters) => {
    const { from, to, campaignId, agentId } = filters;
    const where = {};
    if (campaignId)
        where.campaignId = campaignId;
    if (agentId)
        where.agentId = agentId;
    if (from || to) {
        where.startedAt = {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
        };
    }
    const [totalCalls, answered, noAnswer, voicemail, callback, dnc, wrongNumber, failed] = await Promise.all([
        prisma_1.default.call.count({ where }),
        prisma_1.default.call.count({ where: { ...where, disposition: 'ANSWERED' } }),
        prisma_1.default.call.count({ where: { ...where, disposition: 'NO_ANSWER' } }),
        prisma_1.default.call.count({ where: { ...where, disposition: 'VOICEMAIL' } }),
        prisma_1.default.call.count({ where: { ...where, disposition: 'CALLBACK' } }),
        prisma_1.default.call.count({ where: { ...where, disposition: 'DO_NOT_CALL' } }),
        prisma_1.default.call.count({ where: { ...where, disposition: 'WRONG_NUMBER' } }),
        prisma_1.default.call.count({ where: { ...where, status: 'FAILED' } }),
    ]);
    const totalDuration = await prisma_1.default.call.aggregate({
        _sum: { duration: true },
        where: { ...where, status: 'COMPLETED' },
    });
    const answerRate = totalCalls > 0
        ? Math.round((answered / totalCalls) * 100 * 10) / 10
        : 0;
    return {
        totalCalls,
        answered,
        noAnswer,
        voicemail,
        callback,
        dnc,
        wrongNumber,
        failed,
        totalTalkTimeSecs: totalDuration._sum.duration ?? 0,
        answerRate,
    };
};
exports.getSummary = getSummary;
const getCallTrend = async (filters) => {
    const { from, to } = filters;
    // Use raw query for time-series bucketing — prisma doesn't natively support date_trunc in groupBy
    const rows = await prisma_1.default.$queryRaw `
    SELECT
      DATE_TRUNC('day', "startedAt") AS date,
      COUNT(*)                        AS total,
      COUNT(*) FILTER (WHERE disposition = 'ANSWERED') AS answered
    FROM "Call"
    WHERE 1=1
      ${from ? prisma_1.default.$queryRaw `AND "startedAt" >= ${from}` : prisma_1.default.$queryRaw ``}
      ${to ? prisma_1.default.$queryRaw `AND "startedAt" <= ${to}` : prisma_1.default.$queryRaw ``}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
    return rows.map(r => ({
        date: r.date,
        total: Number(r.total),
        answered: Number(r.answered),
    }));
};
exports.getCallTrend = getCallTrend;
const getCampaignBreakdown = async (filters) => {
    const { from, to } = filters;
    const dateFilter = {};
    if (from || to) {
        dateFilter.startedAt = {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
        };
    }
    const campaigns = await prisma_1.default.campaign.findMany({
        select: {
            id: true,
            name: true,
            status: true,
            _count: { select: { calls: true, contacts: true } },
            calls: {
                where: dateFilter,
                select: { status: true, disposition: true, duration: true },
            },
        },
    });
    return campaigns.map(c => {
        const total = c.calls.length;
        const answered = c.calls.filter(x => x.disposition === 'ANSWERED').length;
        const talkTime = c.calls.reduce((a, x) => a + (x.duration ?? 0), 0);
        return {
            id: c.id,
            name: c.name,
            status: c.status,
            totalContacts: c._count.contacts,
            totalCalls: total,
            answered,
            answerRate: total > 0 ? Math.round((answered / total) * 100 * 10) / 10 : 0,
            totalTalkTimeSecs: talkTime,
        };
    });
};
exports.getCampaignBreakdown = getCampaignBreakdown;
const getAgentBreakdown = async (filters) => {
    const { from, to } = filters;
    const dateFilter = {};
    if (from || to) {
        dateFilter.startedAt = {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
        };
    }
    const agents = await prisma_1.default.user.findMany({
        where: { isActive: true },
        select: {
            id: true,
            agentCode: true,
            name: true,
            status: true,
            calls: {
                where: dateFilter,
                select: { status: true, disposition: true, duration: true },
            },
        },
    });
    return agents.map(a => {
        const total = a.calls.length;
        const answered = a.calls.filter(x => x.disposition === 'ANSWERED').length;
        const talkTime = a.calls.reduce((acc, x) => acc + (x.duration ?? 0), 0);
        return {
            id: a.id,
            agentCode: a.agentCode,
            name: a.name,
            status: a.status,
            totalCalls: total,
            answered,
            answerRate: total > 0 ? Math.round((answered / total) * 100 * 10) / 10 : 0,
            totalTalkTimeSecs: talkTime,
        };
    });
};
exports.getAgentBreakdown = getAgentBreakdown;
//# sourceMappingURL=reports.service.js.map