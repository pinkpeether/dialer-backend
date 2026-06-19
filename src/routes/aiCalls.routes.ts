import { Router } from 'express'
import {
  getRetellCallDebug,
  receiveRetellWebhook,
  testOutboundAiCall,
} from '../controllers/aiCalls.controller'

const router = Router()

router.post('/test-outbound', testOutboundAiCall)
router.post('/retell/webhook', receiveRetellWebhook)
router.get('/retell/calls/:callId', getRetellCallDebug)

export default router
