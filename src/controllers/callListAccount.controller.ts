import type { CallStatus } from '@prisma/client'
import type { Response, NextFunction } from 'express'
import { listCallsWithAccounts } from '../services/callAccountList.service'
import { AppError } from '../middleware/errorHandler'
import type { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'

const CALL_STATUSES: readonly CallStatus[] = ['INITIATED', 'RINGING', 'ANSWERED', 'NO_ANSWER', 'FAILED', 'COMPLETED']

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

const getString = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined
const getNumber = (value: unknown): number | undefined => {
  const raw = getString(value)
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}
const getDate = (value: unknown): Date | undefined => {
  const raw = getString(value)
  if (!raw) return undefined
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}
const getStatus = (value: unknown): CallStatus | undefined => {
  const raw = getString(value)
  if (!raw) return undefined
  const alias = STATUS_ALIASES[raw.toLowerCase()]
  if (alias) return alias
  const upper = raw.toUpperCase() as CallStatus
  if (!CALL_STATUSES.includes(upper)) throw new AppError('Invalid call status filter', 400)
  return upper
}

export const listCalls = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await listCallsWithAccounts({
      campaignId: getNumber(req.query.campaignId),
      agentId: getNumber(req.query.agentId),
      status: getStatus(req.query.status),
      direction: getString(req.query.direction),
      page: getNumber(req.query.page),
      limit: getNumber(req.query.limit),
      startDate: getDate(req.query.startDate),
      endDate: getDate(req.query.endDate),
    }, req.user)
    return sendSuccess(res, result, 'Calls fetched')
  } catch (err) {
    return next(err)
  }
}
