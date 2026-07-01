import type { Response, NextFunction } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { buildCustomerProfileImpact } from '../services/customerProfileImpact.service'

const actorFromRequest = (req: AuthRequest) => req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : undefined

export const previewCustomerProfileImpact = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await buildCustomerProfileImpact(req.params.accountId, actorFromRequest(req)), 'Customer profile impact preview fetched')
  } catch (err) {
    return next(err)
  }
}
