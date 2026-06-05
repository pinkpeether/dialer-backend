import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess, sendError } from '../utils/response'
import * as ReportsAnalyticsProService from '../services/reportsAnalyticsPro.service'

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
}

const getRange = (req: AuthRequest) => ({
  from: req.query.from ? String(req.query.from) : undefined,
  to: req.query.to ? String(req.query.to) : undefined,
  campaignId: toNumber(req.query.campaignId),
  agentId: toNumber(req.query.agentId),
})

export const overview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ReportsAnalyticsProService.getOverview(getRange(req))
    return sendSuccess(res, result, 'Reports overview fetched')
  } catch (err) {
    return next(err)
  }
}

export const agentPerformance = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ReportsAnalyticsProService.getAgentPerformance({
      ...getRange(req),
      period: req.query.period ? String(req.query.period) : undefined,
    })
    return sendSuccess(res, result, 'Agent performance report fetched')
  } catch (err) {
    return next(err)
  }
}

export const hourlyAnalytics = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ReportsAnalyticsProService.getHourlyAnalytics(getRange(req))
    return sendSuccess(res, result, 'Hourly analytics fetched')
  } catch (err) {
    return next(err)
  }
}

export const conversionReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ReportsAnalyticsProService.getConversionReport(getRange(req))
    return sendSuccess(res, result, 'Conversion report fetched')
  } catch (err) {
    return next(err)
  }
}

export const durationAnalysis = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ReportsAnalyticsProService.getDurationAnalysis(getRange(req))
    return sendSuccess(res, result, 'Duration analysis fetched')
  } catch (err) {
    return next(err)
  }
}

export const missedCallReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ReportsAnalyticsProService.getMissedCallReport(getRange(req))
    return sendSuccess(res, result, 'Missed-call report fetched')
  } catch (err) {
    return next(err)
  }
}

export const dailySummaryEmailPreview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ReportsAnalyticsProService.buildDailySummaryEmail(getRange(req))
    return sendSuccess(res, result, 'Daily summary email preview generated')
  } catch (err) {
    return next(err)
  }
}

export const sendDailySummaryEmail = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ReportsAnalyticsProService.sendDailySummaryEmail(getRange(req))
    return sendSuccess(res, result, 'Daily summary email send evaluated')
  } catch (err) {
    return next(err)
  }
}

export const campaignPdf = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaignId = Number(req.params.campaignId)
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return sendError(res, 'Valid campaignId is required', 400)
    }

    const result = await ReportsAnalyticsProService.buildCampaignPdf(campaignId, getRange(req))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    return res.send(result.buffer)
  } catch (err) {
    return next(err)
  }
}

export const exportCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const csv = await ReportsAnalyticsProService.exportReportCsv(getRange(req))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ptdt-reports-summary.csv"')
    return res.send(csv)
  } catch (err) {
    return next(err)
  }
}
