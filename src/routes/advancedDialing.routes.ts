import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as AdvancedDialingController from '../controllers/advancedDialing.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'))

router.get('/metrics', AdvancedDialingController.metrics)
router.post('/pacing/preview', AdvancedDialingController.pacingPreview)
router.post('/guardrails/preview', AdvancedDialingController.guardrailPreview)

export default router
