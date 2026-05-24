import type { Response, NextFunction } from 'express'
import * as DncService from '../services/dnc.service'
import { AppError } from '../middleware/errorHandler'
import type { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'

export const getAllDnc = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { page, limit, search } = req.query
    const result = await DncService.getAllDnc({
      page:   page   ? Number(page)  : 1,
      limit:  limit  ? Number(limit) : 50,
      search: typeof search === 'string' ? search.trim() : undefined,
    })
    return sendSuccess(res, result, 'DNC list fetched')
  } catch (err) { return next(err) }
}

export const checkDnc = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : ''
    if (!phone) throw new AppError('phone query param required', 400)
    const isDnc = await DncService.checkDnc(phone)
    return sendSuccess(res, { isDnc }, 'DNC check complete')
  } catch (err) { return next(err) }
}

export const addToDnc = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { phone, reason } = req.body
    if (!phone || typeof phone !== 'string') throw new AppError('phone is required', 400)
    const entry = await DncService.addToDnc(
      phone,
      typeof reason === 'string' ? reason : undefined,
      req.user!.id,
      req.user,
      req.ip
    )
    return sendSuccess(res, entry, 'Phone added to DNC list', 201)
  } catch (err) { return next(err) }
}

export const removeFromDnc = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) throw new AppError('Invalid DNC entry id', 400)
    await DncService.removeFromDnc(id, req.user, req.ip)
    return sendSuccess(res, null, 'Phone removed from DNC list')
  } catch (err) { return next(err) }
}
