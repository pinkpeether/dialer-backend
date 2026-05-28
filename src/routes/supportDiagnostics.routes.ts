import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as SupportDiagnosticsController from '../controllers/supportDiagnostics.controller'
import * as PermissionReviewController from '../controllers/permissionReview.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/', SupportDiagnosticsController.getDiagnostics)
router.get('/download', SupportDiagnosticsController.downloadDiagnostics)
router.get('/access-review', authorize('ADMIN'), PermissionReviewController.getReview)

export default router
