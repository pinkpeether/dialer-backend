import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as OpsController from '../controllers/ops.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/summary', OpsController.summary)
router.post('/run-notification-jobs', authorize('ADMIN'), OpsController.runNotificationJobs)

export default router
