import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as RecordingStorageProService from '../services/recordingStoragePro.service'

const parseBool = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = String(value).toLowerCase()
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  return undefined
}

const parseNumber = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

const filtersFromQuery = (query: Record<string, unknown>) => ({
  page: parseNumber(query.page),
  limit: parseNumber(query.limit),
  search: query.search ? String(query.search) : undefined,
  campaignId: parseNumber(query.campaignId),
  agentId: parseNumber(query.agentId),
  status: query.status ? String(query.status) : undefined,
  source: query.source ? String(query.source) : undefined,
  from: query.from ? String(query.from) : undefined,
  to: query.to ? String(query.to) : undefined,
  minDuration: parseNumber(query.minDuration),
  maxDuration: parseNumber(query.maxDuration),
  hasTranscript: parseBool(query.hasTranscript),
})

export const search = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingStorageProService.searchRecordings(filtersFromQuery(req.query))
    return sendSuccess(res, result, 'Recording search completed')
  } catch (err) {
    return next(err)
  }
}

export const overview = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingStorageProService.getRecordingStorageOverview()
    return sendSuccess(res, result, 'Recording storage overview fetched')
  } catch (err) {
    return next(err)
  }
}

export const downloadInfo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingStorageProService.getRecordingDownload(Number(req.params.callId))
    return sendSuccess(res, result, 'Recording download link fetched')
  } catch (err) {
    return next(err)
  }
}

export const redirectDownload = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingStorageProService.getRecordingDownload(Number(req.params.callId))
    return res.redirect(result.downloadUrl)
  } catch (err) {
    return next(err)
  }
}

export const exportCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const csv = await RecordingStorageProService.exportRecordingSearchCsv(filtersFromQuery(req.query))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ptdt-recordings-export.csv"')
    return res.send(csv)
  } catch (err) {
    return next(err)
  }
}

export const getRetentionPolicy = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingStorageProService.getRetentionPolicy()
    return sendSuccess(res, result, 'Recording retention policy fetched')
  } catch (err) {
    return next(err)
  }
}

export const updateRetentionPolicy = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingStorageProService.updateRetentionPolicy(req.body || {}, req.user?.id)
    return sendSuccess(res, result, 'Recording retention policy updated')
  } catch (err) {
    return next(err)
  }
}

export const previewPurge = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingStorageProService.previewRetentionPurge(req.body || {})
    return sendSuccess(res, result, 'Retention purge preview generated')
  } catch (err) {
    return next(err)
  }
}

export const runPurge = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingStorageProService.runRetentionPurge({
      dryRun: parseBool(req.body?.dryRun),
      policyOverride: req.body?.policyOverride,
    }, req.user?.id)
    return sendSuccess(res, result, result.message)
  } catch (err) {
    return next(err)
  }
}
