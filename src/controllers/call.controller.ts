import type { CallDisposition, CallStatus } from '@prisma/client'
import type { Response, NextFunction } from 'express'
import * as CallService from '../services/call.service'
import { AppError } from '../middleware/errorHandler'
import type { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'

const CALL_STATUSES: readonly CallStatus[] = [
  'INITIATED',
  'RINGING',
  'ANSWERED',
  'NO_ANSWER',
  'FAILED',
  'COMPLETED',
]

const CALL_DISPOSITIONS: readonly CallDisposition[] = [
  'ANSWERED',
  'NO_ANSWER',
  'VOICEMAIL',
  'CALLBACK',
  'WRONG_NUMBER',
  'DO_NOT_CALL',
]

const getQueryString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const getQueryNumber = (value: unknown): number | undefined => {
  const raw = getQueryString(value)
  if (!raw) return undefined

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

const getQueryDate = (value: unknown): Date | undefined => {
  const raw = getQueryString(value)
  if (!raw) return undefined

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

const getQueryStatus = (value: unknown): CallStatus | undefined => {
  const raw = getQueryString(value)
  if (!raw) return undefined

  if (!CALL_STATUSES.includes(raw as CallStatus)) {
    throw new AppError('Invalid call status filter', 400)
  }

  return raw as CallStatus
}

const getDisposition = (value: unknown): CallDisposition => {
  if (typeof value !== 'string' || !CALL_DISPOSITIONS.includes(value as CallDisposition)) {
    throw new AppError('Invalid disposition', 400)
  }

  return value as CallDisposition
}

export const listCalls = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await CallService.listCalls({
      campaignId: getQueryNumber(req.query.campaignId),
      agentId: getQueryNumber(req.query.agentId),
      status: getQueryStatus(req.query.status),
      page: getQueryNumber(req.query.page),
      limit: getQueryNumber(req.query.limit),
      startDate: getQueryDate(req.query.startDate),
      endDate: getQueryDate(req.query.endDate),
    }, req.user)

    return sendSuccess(res, result, 'Calls fetched')
  } catch (err) {
    return next(err)
  }
}

export const getCallById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const callId = Number(req.params.id)
    if (!Number.isFinite(callId)) throw new AppError('Invalid call id', 400)

    const call = await CallService.getCallById(callId, req.user)
    return sendSuccess(res, call, 'Call fetched')
  } catch (err) {
    return next(err)
  }
}

export const updateDisposition = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const callId = Number(req.params.id)
    if (!Number.isFinite(callId)) throw new AppError('Invalid call id', 400)

    const call = await CallService.updateCallDisposition(
      callId,
      getDisposition(req.body.disposition),
      typeof req.body.notes === 'string' ? req.body.notes : undefined,
      req.user
    )

    return sendSuccess(res, call, 'Disposition updated')
  } catch (err) {
    return next(err)
  }
}
