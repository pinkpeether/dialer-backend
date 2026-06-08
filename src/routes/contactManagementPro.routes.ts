import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as ContactManagementProController from '../controllers/contactManagementPro.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/duplicates', ContactManagementProController.duplicates)
router.post('/import/preview', ContactManagementProController.importPreview)
router.get('/export', ContactManagementProController.exportCsv)
router.get('/:contactId/timeline', ContactManagementProController.timeline)
router.patch('/:contactId/notes', ContactManagementProController.updateNotes)
router.patch('/:contactId/tags', ContactManagementProController.updateTags)

export default router
