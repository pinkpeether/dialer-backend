import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { dynamicCallerIdCreateService } from '../services/dynamicCallerIdCreate.service'

const router = Router()
router.use(authenticate)

router.post('/request', authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    return sendSuccess(res, await dynamicCallerIdCreateService.request(req.user!, req.body), 'Dynamic Caller ID request submitted', 201)
  } catch (err) { return next(err) }
})

router.post('/admin', authorize('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    return sendSuccess(res, await dynamicCallerIdCreateService.adminCreate(req.user!, req.body), 'Dynamic Caller ID created', 201)
  } catch (err) { return next(err) }
})

export default router
