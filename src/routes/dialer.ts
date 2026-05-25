import { Router } from 'express'
import * as DialerController from '../controllers/dialer.controller'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

// ── Protected routes ──
router.use('/token',           authenticate)
router.use('/start',           authenticate)
router.use('/stop',            authenticate)
router.use('/active',          authenticate)
router.use('/call/manual',     authenticate)
router.use('/call/adhoc',      authenticate)
router.use('/call/hangup',     authenticate)
router.use('/call/dtmf',       authenticate)
router.use('/preview',         authenticate)

// Agent softphone token
router.get('/token', DialerController.getAccessToken)

// Campaign control
router.post('/start/:campaignId',
  authorize('ADMIN', 'SUPERVISOR'),
  DialerController.startCampaign
)
router.post('/stop/:campaignId',
  authorize('ADMIN', 'SUPERVISOR'),
  DialerController.stopCampaign
)
router.get('/active',
  authorize('ADMIN', 'SUPERVISOR'),
  DialerController.getActiveCampaigns
)

// Preview dialing
router.post('/preview/:campaignId/next',
  authorize('AGENT', 'ADMIN', 'SUPERVISOR'),
  DialerController.getNextPreviewContact
)
router.post('/preview/:campaignId/:contactId/release',
  authorize('AGENT', 'ADMIN', 'SUPERVISOR'),
  DialerController.releasePreviewContact
)
router.post('/preview/:campaignId/:contactId/call',
  authorize('AGENT', 'ADMIN', 'SUPERVISOR'),
  DialerController.callPreviewContact
)

// Manual call (requires contactId + campaignId)
router.post('/call/manual',  DialerController.makeManualCall)

// Ad-hoc call (direct phone number — no contact/campaign required)
router.post('/call/adhoc',   DialerController.makeAdhocCall)

// DTMF — send keypad digits to active call
router.post('/call/dtmf',    DialerController.sendDTMF)

// Hangup
router.post('/call/hangup',  DialerController.hangupCall)

// ── Twilio TwiML endpoints (no auth — Twilio calls these) ──
router.post('/twiml/connect/:callId', DialerController.twimlConnect)
router.post('/twiml/agent/:agentId',  DialerController.twimlAgent)

// ── Twilio Webhooks (no auth — Twilio calls these) ──
router.post('/webhook/status/:callId',    DialerController.webhookStatus)
router.post('/webhook/recording/:callId', DialerController.webhookRecording)
router.post('/webhook/amd/:callId',       DialerController.webhookAMD)

export default router
