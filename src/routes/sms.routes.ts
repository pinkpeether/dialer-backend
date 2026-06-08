import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as SmsController from '../controllers/sms.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR', 'AGENT'))

router.get('/config', SmsController.getConfig)
router.post('/send', SmsController.sendSms)
router.get('/status/:messageId', SmsController.getStatus)

export default router
