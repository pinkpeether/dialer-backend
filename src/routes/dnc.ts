import { Router } from 'express'
import * as DncController from '../controllers/dnc.controller'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.use(authenticate)

// GET /api/dnc/check?phone=+923001234567
router.get('/check',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR', 'AGENT'),
  DncController.checkDnc
)

// GET /api/dnc
router.get('/',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  DncController.getAllDnc
)

// POST /api/dnc
router.post('/',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  DncController.addToDnc
)

// DELETE /api/dnc/:id
router.delete('/:id',
  authorize('ADMIN'),
  DncController.removeFromDnc
)

export default router
