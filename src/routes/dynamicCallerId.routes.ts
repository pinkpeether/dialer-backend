import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as DynamicCallerIdController from '../controllers/dynamicCallerId.controller'

const router = Router()
router.use(authenticate)

router.get('/summary', authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT'), DynamicCallerIdController.getSummary)
router.get('/', authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT'), DynamicCallerIdController.list)
router.post('/request', authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER'), DynamicCallerIdController.requestCallerId)
router.post('/admin', authorize('ADMIN'), DynamicCallerIdController.adminCreate)
router.patch('/:id/status', authorize('ADMIN'), DynamicCallerIdController.setStatus)

export default router
