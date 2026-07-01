import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import * as CustomerProfileImpactController from '../controllers/customerProfileImpact.controller'

const router = Router()
router.use(authenticate)
router.get('/accounts/:accountId/review', CustomerProfileImpactController.previewCustomerProfileImpact)
export default router
