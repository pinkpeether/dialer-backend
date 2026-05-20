import { Router } from 'express'
import * as CallbackController from '../controllers/callback.controller'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.use(authenticate)

// GET /api/callbacks
router.get('/',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CallbackController.getAllCallbacks
)

// POST /api/callbacks
router.post('/',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CallbackController.createCallback
)

// PATCH /api/callbacks/:id
router.patch('/:id',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CallbackController.updateCallback
)

export default router
