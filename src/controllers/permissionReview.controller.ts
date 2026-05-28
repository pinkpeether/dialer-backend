import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { getPermissionReview } from '../services/permissionReview.service'

export const getReview = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, getPermissionReview(), 'Permission review fetched')
  } catch (err) {
    return next(err)
  }
}
