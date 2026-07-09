import type { Response, NextFunction } from 'express'
import type { AttendanceSessionStatus } from '@prisma/client'
import type { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as Attendance from '../services/attendanceIntegrity.service'

const ipOf = (req: AuthRequest) => req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || null

const numberOrUndefined = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const dateOrUndefined = (value: unknown) => {
  if (!value) return undefined
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

export const clockIn = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const session = await Attendance.clockIn(req.user, req.body || {}, ipOf(req))
    return sendSuccess(res, session, 'Attendance clock-in recorded')
  } catch (err) {
    return next(err)
  }
}

export const clockOut = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const session = await Attendance.clockOut(req.user, numberOrUndefined(req.body?.sessionId), req.body || {}, ipOf(req))
    return sendSuccess(res, session, 'Attendance clock-out recorded')
  } catch (err) {
    return next(err)
  }
}

export const heartbeat = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const session = await Attendance.heartbeat(req.user, numberOrUndefined(req.body?.sessionId), req.body || {}, ipOf(req))
    return sendSuccess(res, session, 'Attendance heartbeat recorded')
  } catch (err) {
    return next(err)
  }
}

export const disconnect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sessionId = numberOrUndefined(req.body?.sessionId)
    if (!sessionId) throw new Error('sessionId is required')
    const session = await Attendance.markDisconnect(req.user, sessionId, req.body || {}, ipOf(req))
    return sendSuccess(res, session, 'Attendance disconnect recorded')
  } catch (err) {
    return next(err)
  }
}

export const sipPresence = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const presence = await Attendance.updateSipPresence(req.user, req.body || {}, ipOf(req))
    return sendSuccess(res, presence, 'SIP presence updated')
  } catch (err) {
    return next(err)
  }
}

export const me = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const session = await Attendance.getMyActiveSession(req.user)
    return sendSuccess(res, { session }, 'Active attendance session loaded')
  } catch (err) {
    return next(err)
  }
}

export const overview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await Attendance.listOverview(req.user, {
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      from: dateOrUndefined(req.query.from),
      to: dateOrUndefined(req.query.to),
      limit: numberOrUndefined(req.query.limit),
    })
    return sendSuccess(res, data, 'Attendance integrity overview loaded')
  } catch (err) {
    return next(err)
  }
}

export const review = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sessionId = numberOrUndefined(req.params.id)
    if (!sessionId) throw new Error('Invalid attendance session id')
    const session = await Attendance.reviewSession(req.user, sessionId, {
      status: req.body?.status as AttendanceSessionStatus | undefined,
      notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
      removeFlag: Boolean(req.body?.removeFlag),
    }, ipOf(req))
    return sendSuccess(res, session, 'Attendance review saved')
  } catch (err) {
    return next(err)
  }
}
