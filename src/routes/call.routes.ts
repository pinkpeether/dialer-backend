import { Router } from 'express'
import * as CallController from '../controllers/call.controller'
import { authenticate, authorize } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { updateDispositionSchema } from '../validators/call.validator'

const router = Router()

router.use(authenticate)

router.get(
  '/',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CallController.listCalls
)

router.get(
  '/:id',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CallController.getCallById
)

router.patch(
  '/:id/disposition',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  validate(updateDispositionSchema),
  CallController.updateDisposition
)

export default router
