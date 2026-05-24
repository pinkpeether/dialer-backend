import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as RecordingController from '../controllers/recording.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/', RecordingController.list)
router.get('/:callId', RecordingController.detail)
router.get('/:callId/access', RecordingController.access)

export default router
