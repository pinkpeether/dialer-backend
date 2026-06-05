import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as CallControlController from '../controllers/callControl.controller'

const router = Router()

// TwiML endpoint must stay open because Twilio/PBX callbacks cannot send JWT.
router.post('/twiml/supervisor', CallControlController.supervisorJoinTwiml)
router.get('/twiml/supervisor', CallControlController.supervisorJoinTwiml)

router.use(authenticate)

router.get('/capabilities',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CallControlController.capabilities
)

router.get('/active-calls',
  authorize('ADMIN', 'SUPERVISOR'),
  CallControlController.activeCalls
)

router.post('/actions/:action',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CallControlController.runAction
)

export default router
