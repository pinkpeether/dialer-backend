import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as SupportDiagnosticsController from '../controllers/supportDiagnostics.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/', SupportDiagnosticsController.getDiagnostics)
router.get('/download', SupportDiagnosticsController.downloadDiagnostics)

export default router
