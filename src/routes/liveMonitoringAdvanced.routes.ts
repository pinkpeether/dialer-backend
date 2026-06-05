import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as LiveMonitoringAdvancedController from '../controllers/liveMonitoringAdvanced.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/overview', LiveMonitoringAdvancedController.overview)

export default router
