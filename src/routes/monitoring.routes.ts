import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as MonitoringController from '../controllers/monitoring.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/summary', MonitoringController.summary)
router.post('/runtime/reset', authorize('ADMIN'), MonitoringController.resetRuntime)

export default router
