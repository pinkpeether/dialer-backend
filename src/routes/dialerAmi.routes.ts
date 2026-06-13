import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middleware/auth'
import { sendError, sendSuccess } from '../utils/response'
import * as ProviderCallService from '../services/providerCall.service'

const router = Router()
router.use(authenticate)

router.post('/call/backend-adhoc', authorize('AGENT', 'ADMIN', 'SUPERVISOR', 'CUSTOMER_ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const { phone, note, callerIdId, agentExtension } = req.body
    if (!phone) return sendError(res, 'phone number required', 400)
    if (!agentExtension) return sendError(res, 'agentExtension required for backend-originated Dynamic Caller ID calls', 400)
    const result = await ProviderCallService.initiateAdhocCall(String(phone).trim(), req.user!, note ? String(note) : undefined, { callerIdId, agentExtension })
    return sendSuccess(res, result, 'Backend-originated Dynamic Caller ID call initiated')
  } catch (err) { return next(err) }
})

router.post('/call/backend-hangup', authorize('AGENT', 'ADMIN', 'SUPERVISOR', 'CUSTOMER_ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const { callId, providerCallId, phone, agentExtension } = req.body
    if (!callId && !providerCallId && !phone) return sendError(res, 'callId, providerCallId, or phone required', 400)
    const result = await ProviderCallService.hangupBackendOriginated({
      callId,
      providerCallId,
      phone: phone ? String(phone).trim() : null,
      agentExtension: agentExtension ? String(agentExtension).trim() : null,
    })
    return sendSuccess(res, result, 'Backend-originated Dynamic Caller ID call hangup requested')
  } catch (err) { return next(err) }
})

export default router
