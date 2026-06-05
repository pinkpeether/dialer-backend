import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as LiveAiController from '../controllers/liveAi.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR', 'AGENT'))

router.get('/sessions', LiveAiController.listSessions)
router.post('/calls/:callId/start', LiveAiController.startSession)
router.get('/calls/:callId/session', LiveAiController.getSession)
router.post('/calls/:callId/chunk', LiveAiController.ingestChunk)
router.get('/calls/:callId/script', LiveAiController.getSmartScript)
router.post('/calls/:callId/auto-disposition', LiveAiController.applyAutoDisposition)
router.post('/calls/:callId/follow-up', LiveAiController.createFollowUp)
router.post('/calls/:callId/stop', LiveAiController.stopSession)

export default router
