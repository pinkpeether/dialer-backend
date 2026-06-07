import { Router } from 'express'
import * as DialerController from '../controllers/dialer.controller'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.use('/start', authenticate)
router.use('/stop', authenticate)
router.use('/active', authenticate)
router.use('/engine', authenticate)
router.use('/call/manual', authenticate)
router.use('/call/adhoc', authenticate)
router.use('/call/hangup', authenticate)
router.use('/call/dtmf', authenticate)
router.use('/preview', authenticate)


router.post('/start/:campaignId', authorize('ADMIN', 'SUPERVISOR'), DialerController.startCampaign)
router.post('/stop/:campaignId', authorize('ADMIN', 'SUPERVISOR'), DialerController.stopCampaign)
router.get('/active', authorize('ADMIN', 'SUPERVISOR'), DialerController.getActiveCampaigns)

router.get('/engine/:campaignId/status', authorize('ADMIN', 'SUPERVISOR'), DialerController.getCampaignEngineStatus)
router.post('/engine/:campaignId/tick', authorize('ADMIN', 'SUPERVISOR'), DialerController.runCampaignEngineTick)

router.post('/preview/:campaignId/next', authorize('AGENT', 'ADMIN', 'SUPERVISOR'), DialerController.getNextPreviewContact)
router.post('/preview/:campaignId/:contactId/release', authorize('AGENT', 'ADMIN', 'SUPERVISOR'), DialerController.releasePreviewContact)
router.post('/preview/:campaignId/:contactId/call', authorize('AGENT', 'ADMIN', 'SUPERVISOR'), DialerController.callPreviewContact)

router.post('/call/manual', DialerController.makeManualCall)
router.post('/call/adhoc', DialerController.makeAdhocCall)
router.post('/call/dtmf', DialerController.sendDTMF)
router.post('/call/hangup', DialerController.hangupCall)


export default router
