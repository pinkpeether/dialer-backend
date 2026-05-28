import { Router } from 'express'
import { authenticate as requireLogin, authorize as requireRole } from '../middleware/auth'
import * as Controller from '../controllers/permissionReview.controller'

const router = Router()

router.use(requireLogin)
router.use(requireRole('ADMIN'))
router.get('/', Controller.getReview)

export default router
