import { Router } from 'express'
import { testOutboundAiCall } from '../controllers/aiCalls.controller'

const router = Router()

router.post('/test-outbound', testOutboundAiCall)

export default router
