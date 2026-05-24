import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as ExportController from '../controllers/export.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/calls.csv', ExportController.callsCsv)
router.get('/contacts.csv', ExportController.contactsCsv)
router.get('/campaigns/:id.csv', ExportController.campaignCsv)

export default router
