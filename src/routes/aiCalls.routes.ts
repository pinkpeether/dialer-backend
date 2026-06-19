import { Router } from 'express'
import {
  getAiCallLog,
  getRetellCallDebug,
  listAiCallLogs,
  receiveRetellWebhook,
  testOutboundAiCall,
} from '../controllers/aiCalls.controller'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.post('/test-outbound', testOutboundAiCall)
router.post('/retell/webhook', receiveRetellWebhook)

router.get('/logs', authenticate, authorize('ADMIN', 'SUPERVISOR'), listAiCallLogs)
router.get('/logs/:id', authenticate, authorize('ADMIN', 'SUPERVISOR'), getAiCallLog)

router.get('/retell/calls/:callId', getRetellCallDebug)

export default router
