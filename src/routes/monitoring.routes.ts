import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as MonitoringController from '../controllers/monitoring.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'))

router.get('/summary', MonitoringController.summary)
router.post('/runtime/reset', authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'), MonitoringController.resetRuntime)

export default router
