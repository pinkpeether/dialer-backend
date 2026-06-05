import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as controller from '../controllers/notificationsAlertsPro.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR', 'AGENT'))

router.get('/summary', controller.getSummary)
router.get('/preferences', controller.getPreferences)
router.patch('/preferences', controller.updatePreferences)
router.get('/alerts', controller.listAlerts)
router.post('/alerts', controller.createAlert)
router.post('/alerts/:alertId/acknowledge', controller.acknowledgeAlert)
router.post('/alerts/acknowledge-all', controller.acknowledgeAll)
router.post('/sweep', controller.runSweep)
router.post('/angry-customer', controller.createAngryCustomerAlert)
router.post('/shift-reminder', controller.createShiftReminder)

export default router
