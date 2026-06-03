import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as CallIntelligenceController from '../controllers/callIntelligence.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/calls/:callId', CallIntelligenceController.getByCall)
router.post('/calls/:callId/transcript', CallIntelligenceController.createTranscript)
router.post('/calls/:callId/insight', CallIntelligenceController.createInsight)

export default router
