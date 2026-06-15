import { Router } from 'express'
import * as CallController from '../controllers/call.controller'
import { authenticate, authorize } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { updateDispositionSchema } from '../validators/call.validator'

const router = Router()

router.use(authenticate)

router.get(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CUSTOMER_ADMIN', 'MANAGER', 'AGENT'),
  CallController.listCalls
)

router.get(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CUSTOMER_ADMIN', 'MANAGER', 'AGENT'),
  CallController.getCallById
)

router.patch(
  '/:id/disposition',
  authorize('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CUSTOMER_ADMIN', 'MANAGER', 'AGENT'),
  validate(updateDispositionSchema),
  CallController.updateDisposition
)

router.patch(
  '/:id/end',
  authorize('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CUSTOMER_ADMIN', 'MANAGER', 'AGENT'),
  CallController.endCall
)

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CUSTOMER_ADMIN', 'MANAGER', 'AGENT'),
  CallController.createCall
)

export default router
