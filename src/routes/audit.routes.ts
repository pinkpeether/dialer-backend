import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as AuditController from '../controllers/audit.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN'))

router.get('/', AuditController.list)
router.get('/:id', AuditController.detail)

export default router
