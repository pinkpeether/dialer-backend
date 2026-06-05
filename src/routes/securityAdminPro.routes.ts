import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import { securityAdminProController } from '../controllers/securityAdminPro.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN'))

router.get('/overview', securityAdminProController.overview)
router.get('/checklist', securityAdminProController.checklist)
router.get('/policy', securityAdminProController.getPolicy)
router.put('/policy', securityAdminProController.updatePolicy)
router.get('/single-session-audit', securityAdminProController.singleSessionAudit)
router.post('/single-session-audit/disconnect-stale', securityAdminProController.disconnectStaleSessions)
router.get('/billing', securityAdminProController.billing)
router.get('/backup/export', securityAdminProController.exportBackup)
router.post('/restore/preview', securityAdminProController.restorePreview)
router.get('/ip-check', securityAdminProController.ipCheck)

export default router
