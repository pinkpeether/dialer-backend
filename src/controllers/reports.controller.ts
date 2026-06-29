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

export const getSummary = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { from, to, campaignId, agentId } = req.query
    const result = await ReportsService.getSummary({
      from:       parseDate(from),
      to:         parseDate(to),
      campaignId: campaignId ? Number(campaignId) : undefined,
      agentId:    agentId    ? Number(agentId)    : undefined,
    }, req.user)
    return sendSuccess(res, result, 'Summary fetched')
  } catch (err) { return next(err) }
}

export const getCallTrend = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { from, to, granularity } = req.query
    if (granularity && granularity !== 'day' && granularity !== 'week') {
      throw new AppError('granularity must be day or week', 400)
    }
    const result = await ReportsService.getCallTrend({
      from:        parseDate(from),
      to:          parseDate(to),
      granularity: granularity as 'day' | 'week' | undefined,
    }, req.user)
    return sendSuccess(res, result, 'Call trend fetched')
  } catch (err) { return next(err) }
}

export const getCampaignBreakdown = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { from, to } = req.query
    const result = await ReportsService.getCampaignBreakdown({
      from: parseDate(from),
      to:   parseDate(to),
    }, req.user)
    return sendSuccess(res, result, 'Campaign breakdown fetched')
  } catch (err) { return next(err) }
}

export const getAgentBreakdown = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { from, to } = req.query
    const result = await ReportsService.getAgentBreakdown({
      from: parseDate(from),
      to:   parseDate(to),
    }, req.user)
    return sendSuccess(res, result, 'Agent breakdown fetched')
  } catch (err) { return next(err) }
}
