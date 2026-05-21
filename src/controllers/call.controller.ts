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

const STATUS_ALIASES: Record<string, CallStatus> = {
  answered: 'ANSWERED',
  completed: 'COMPLETED',
  missed: 'NO_ANSWER',
  no_answer: 'NO_ANSWER',
  noanswer: 'NO_ANSWER',
  failed: 'FAILED',
  queued: 'INITIATED',
  pending: 'INITIATED',
  in_progress: 'RINGING',
  calling: 'RINGING',
  ringing: 'RINGING',
}

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

  const normalized = raw.trim()
  const alias = STATUS_ALIASES[normalized.toLowerCase()]
  if (alias) return alias

  const upper = normalized.toUpperCase() as CallStatus
  if (!CALL_STATUSES.includes(upper)) {
    throw new AppError('Invalid call status filter', 400)
  }

  return upper
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
      direction: getQueryString(req.query.direction),
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

export const createCall = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const remoteNumber = String(req.body.remoteNumber || req.body.phone || '').trim()
    if (!remoteNumber) throw new AppError('remoteNumber is required', 400)

    const startedAtRaw = typeof req.body.startedAt === 'string' ? req.body.startedAt : undefined
    const startedAt = startedAtRaw ? new Date(startedAtRaw) : undefined
    if (startedAt && Number.isNaN(startedAt.getTime())) throw new AppError('Invalid startedAt', 400)

    const call = await CallService.createSipCallLog({
      remoteNumber,
      direction: typeof req.body.direction === 'string' ? req.body.direction : 'outgoing',
      startedAt,
      agentId: req.user?.id,
    }, req.user)

    return sendSuccess(res, call, 'Call logged', 201)
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
      getQueryDate(req.body.callbackAt),
      req.user
    )

    return sendSuccess(res, call, 'Disposition updated')
  } catch (err) {
    return next(err)
  }
}
