import type { Response, NextFunction } from 'express'
import * as CallbackService from '../services/callback.service'
import { AppError } from '../middleware/errorHandler'
import type { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import type { CallbackStatus } from '../services/callback.service'

const VALID_STATUSES: CallbackStatus[] = ['PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED']

export const getAllCallbacks = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { status, from, to, page, limit } = req.query

    if (status && !VALID_STATUSES.includes(status as CallbackStatus)) {
      throw new AppError('Invalid status filter', 400)
    }

    // Agents see only their own callbacks; admins/supervisors see all
    const agentId = req.user?.role === 'AGENT' ? req.user.id : undefined

    const result = await CallbackService.getAllCallbacks({
      status:  status as CallbackStatus | undefined,
      from:    typeof from   === 'string' ? from  : undefined,
      to:      typeof to     === 'string' ? to    : undefined,
      agentId,
      page:    page  ? Number(page)  : 1,
      limit:   limit ? Number(limit) : 30,
    }, req.user)
    return sendSuccess(res, result, 'Callbacks fetched')
  } catch (err) { return next(err) }
}

export const createCallback = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { contactId, callId, scheduledAt, notes } = req.body
    if (!scheduledAt) throw new AppError('scheduledAt is required', 400)

    const callback = await CallbackService.createCallback({
      contactId:   contactId ? Number(contactId) : null,
      callId:      callId    ? Number(callId)    : null,
      agentId:     req.user!.id,
      scheduledAt: String(scheduledAt),
      notes:       typeof notes === 'string' ? notes : null,
    }, req.user)
    return sendSuccess(res, callback, 'Callback scheduled', 201)
  } catch (err) { return next(err) }
}

export const updateCallback = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) throw new AppError('Invalid callback id', 400)

    const { status, scheduledAt, notes } = req.body

    if (status && !VALID_STATUSES.includes(status as CallbackStatus)) {
      throw new AppError('Invalid status', 400)
    }

    const updated = await CallbackService.updateCallback(
      id,
      { status, scheduledAt, notes },
      req.user!.id,
      req.user
    )
    return sendSuccess(res, updated, 'Callback updated')
  } catch (err) { return next(err) }
}
