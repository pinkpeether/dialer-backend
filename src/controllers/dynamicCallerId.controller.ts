import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import { dynamicCallerIdService } from '../services/dynamicCallerId.service'

const idParam = (value: string) => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid Dynamic Caller ID record id', 400)
  return id
}

export const getSummary = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await dynamicCallerIdService.getSummary(req.user!, req.query.accountId as string | undefined), 'Dynamic Caller ID summary fetched')
  } catch (err) { return next(err) }
}

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await dynamicCallerIdService.list(req.user!, req.query.accountId as string | undefined), 'Dynamic Caller IDs fetched')
  } catch (err) { return next(err) }
}

export const requestCallerId = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await dynamicCallerIdService.request(req.user!, req.body), 'Dynamic Caller ID request submitted', 201)
  } catch (err) { return next(err) }
}

export const adminCreate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await dynamicCallerIdService.adminCreate(req.user!, req.body), 'Dynamic Caller ID created', 201)
  } catch (err) { return next(err) }
}

export const setStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await dynamicCallerIdService.setStatus(req.user!, idParam(req.params.id), req.body.status), 'Dynamic Caller ID status updated')
  } catch (err) { return next(err) }
}
