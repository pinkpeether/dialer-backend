import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as SettingsController from '../controllers/settings.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN'))

router.get('/', SettingsController.getAll)
router.patch('/', SettingsController.update)

export default router
