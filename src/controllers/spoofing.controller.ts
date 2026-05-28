import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { spoofingService, CreateSpoofingInput, UpdateSpoofingInput } from '../services/spoofing.service'
import { AppError } from '../middleware/errorHandler'

const idParam = (value: string) => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid caller ID record id', 400)
  return id
}

export const getAll = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await spoofingService.getAll(), 'Caller IDs fetched')
  } catch (err) {
    return next(err)
  }
}

export const getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const record = await spoofingService.getById(idParam(req.params.id))
    if (!record) throw new AppError('Caller ID not found', 404)
    return sendSuccess(res, record, 'Caller ID fetched')
  } catch (err) {
    return next(err)
  }
}

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const record = await spoofingService.create(req.body as CreateSpoofingInput, req.user)
    return sendSuccess(res, record, 'Caller ID created', 201)
  } catch (err) {
    return next(err)
  }
}

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const record = await spoofingService.update(idParam(req.params.id), req.body as UpdateSpoofingInput, req.user)
    return sendSuccess(res, record, 'Caller ID updated')
  } catch (err) {
    return next(err)
  }
}

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await spoofingService.delete(idParam(req.params.id), req.user), 'Caller ID deleted')
  } catch (err) {
    return next(err)
  }
}

export const verify = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await spoofingService.verify(idParam(req.params.id), req.user), 'Caller ID verified')
  } catch (err) {
    return next(err)
  }
}