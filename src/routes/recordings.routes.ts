import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as RecordingController from '../controllers/recording.controller'

const router = Router()

// Signed playback URL endpoint. Auth headers are not available to <audio>, so token verification is the auth.
router.get('/:callId/stream', RecordingController.stream)

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/health', RecordingController.health)
router.get('/', RecordingController.list)
router.get('/:callId', RecordingController.detail)
router.get('/:callId/access', RecordingController.access)

export default router
