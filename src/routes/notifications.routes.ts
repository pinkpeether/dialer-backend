import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as NotificationController from '../controllers/notification.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR', 'AGENT'))

router.get('/', NotificationController.list)
router.patch('/:id/read', NotificationController.markRead)
router.patch('/read-all', NotificationController.markAllRead)

export default router
