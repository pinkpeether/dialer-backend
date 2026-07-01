import type { Response, NextFunction } from 'express'
import * as ReportsService from '../services/reports.service'
import { AppError } from '../middleware/errorHandler'
import type { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'

const parseDate = (v: unknown): Date | undefined => {
  if (typeof v !== 'string' || !v.trim()) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d
}

const parseNumber = (v: unknown): number | undefined => {
  if (typeof v !== 'string' || !v.trim()) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export const getSummary = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to, campaignId, agentId, commercialAccountId } = req.query
    const result = await ReportsService.getSummary({
      from: parseDate(from),
      to: parseDate(to),
      campaignId: parseNumber(campaignId),
      agentId: parseNumber(agentId),
      commercialAccountId: parseNumber(commercialAccountId),
    }, req.user)
    return sendSuccess(res, result, 'Summary fetched')
  } catch (err) { return next(err) }
}

export const getCallTrend = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to, granularity, commercialAccountId } = req.query
    if (granularity && granularity !== 'day' && granularity !== 'week') throw new AppError('granularity must be day or week', 400)
    const result = await ReportsService.getCallTrend({
      from: parseDate(from),
      to: parseDate(to),
      granularity: granularity as 'day' | 'week' | undefined,
      commercialAccountId: parseNumber(commercialAccountId),
    }, req.user)
    return sendSuccess(res, result, 'Call trend fetched')
  } catch (err) { return next(err) }
}

export const getCampaignBreakdown = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to, commercialAccountId } = req.query
    const result = await ReportsService.getCampaignBreakdown({ from: parseDate(from), to: parseDate(to), commercialAccountId: parseNumber(commercialAccountId) }, req.user)
    return sendSuccess(res, result, 'Campaign breakdown fetched')
  } catch (err) { return next(err) }
}

export const getAgentBreakdown = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to, commercialAccountId } = req.query
    const result = await ReportsService.getAgentBreakdown({ from: parseDate(from), to: parseDate(to), commercialAccountId: parseNumber(commercialAccountId) }, req.user)
    return sendSuccess(res, result, 'Agent breakdown fetched')
  } catch (err) { return next(err) }
}
