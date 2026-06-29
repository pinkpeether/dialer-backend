import { Router } from 'express'
import {
  getAiCallLog,
  getRetellCallDebug,
  listAiCallLogs,
  receiveRetellWebhook,
  startOutboundAiCall,
  testOutboundAiCall,
} from '../controllers/aiCalls.controller'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.post('/outbound', authenticate, authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'), startOutboundAiCall)
router.post('/test-outbound', testOutboundAiCall)
router.post('/retell/webhook', receiveRetellWebhook)

router.get('/logs', authenticate, authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'), listAiCallLogs)
router.get('/logs/:id', authenticate, authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'), getAiCallLog)

router.get('/retell/calls/:callId', getRetellCallDebug)

export default router
