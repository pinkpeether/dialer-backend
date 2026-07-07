import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as AttendanceController from '../controllers/attendanceIntegrity.controller'

const router = Router()

router.use(authenticate)

const selfRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT']
const viewerRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR']
const reviewerRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR']

router.get('/me', authorize(...selfRoles), AttendanceController.me)
router.post('/clock-in', authorize(...selfRoles), AttendanceController.clockIn)
router.post('/clock-out', authorize(...selfRoles), AttendanceController.clockOut)
router.post('/heartbeat', authorize(...selfRoles), AttendanceController.heartbeat)
router.post('/disconnect', authorize(...selfRoles), AttendanceController.disconnect)

router.get('/overview', authorize(...viewerRoles), AttendanceController.overview)
router.patch('/sessions/:id/review', authorize(...reviewerRoles), AttendanceController.review)

export default router
