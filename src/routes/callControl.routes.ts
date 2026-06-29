import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as CallControlController from '../controllers/callControl.controller'

const router = Router()

router.use(authenticate)

router.get('/capabilities',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CallControlController.capabilities
)

router.get('/active-calls',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  CallControlController.activeCalls
)

router.post('/actions/:action',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CallControlController.runAction
)

export default router
