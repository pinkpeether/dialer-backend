import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import {
  getDeploymentPlatformOverviewController,
  getDeploymentPlatformChecklistController,
  getDeploymentSmokeCommandsController,
} from '../controllers/deploymentPlatformPro.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/overview', getDeploymentPlatformOverviewController)
router.get('/checklist', getDeploymentPlatformChecklistController)
router.get('/smoke-commands', getDeploymentSmokeCommandsController)

export default router
