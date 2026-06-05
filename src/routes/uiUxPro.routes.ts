import { Router } from 'express'
import { uiUxProController } from '../controllers/uiUxPro.controller'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/overview', uiUxProController.overview)
router.patch('/preferences', uiUxProController.updatePreferences)

router.get('/shortcuts', uiUxProController.shortcuts)
router.put('/shortcuts', uiUxProController.updateShortcuts)

router.get('/mini-call-bar', uiUxProController.miniCallBar)
router.patch('/mini-call-bar', uiUxProController.updateMiniCallBar)

router.post('/celebrations', uiUxProController.triggerCelebration)
router.delete('/celebrations', uiUxProController.clearCelebrations)

export default router
