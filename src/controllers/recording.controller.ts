import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as RecordingService from '../services/recording.service'

const getDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingService.listRecordings({
      from: getDate(req.query.from),
      to: getDate(req.query.to),
      agentId: req.query.agentId ? Number(req.query.agentId) : undefined,
      campaignId: req.query.campaignId ? Number(req.query.campaignId) : undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    })
    return sendSuccess(res, result, 'Recordings fetched')
  } catch (err) {
    return next(err)
  }
}

export const detail = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const recording = await RecordingService.getRecording(Number(req.params.callId))
    return sendSuccess(res, recording, 'Recording fetched')
  } catch (err) {
    return next(err)
  }
}

export const access = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const accessData = await RecordingService.getRecordingAccess(Number(req.params.callId))
    return sendSuccess(res, accessData, 'Recording access fetched')
  } catch (err) {
    return next(err)
  }
}
