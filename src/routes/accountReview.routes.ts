import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as CustomerProfileImpactController from '../controllers/customerProfileImpact.controller'

const router = Router()

router.use(authenticate)
router.get('/accounts/:accountId/review', authorize('SUPER_ADMIN'), CustomerProfileImpactController.previewCustomerProfileImpact)
router.post('/accounts/:accountId/action', authorize('SUPER_ADMIN'), CustomerProfileImpactController.runCustomerProfileAction)

export default router
