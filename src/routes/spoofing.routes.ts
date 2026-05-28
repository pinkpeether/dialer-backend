import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as SpoofingController from '../controllers/spoofing.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN'))

router.get('/', SpoofingController.getAll)
router.get('/:id', SpoofingController.getById)
router.post('/', SpoofingController.create)
router.put('/:id', SpoofingController.update)
router.delete('/:id', SpoofingController.remove)
router.post('/:id/verify', SpoofingController.verify)

export default router