import { Request, Response, NextFunction } from 'express'
import * as DialerService from '../services/dialer.service'
import * as TwilioService from '../services/twilio.service'
import * as PreviewDialingService from '../services/previewDialing.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'
import logger from '../utils/logger'

export const startCampaign = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await DialerService.startCampaign(Number(req.params.campaignId))
    return sendSuccess(res, null, 'Campaign dialing started')
  } catch (err) { return next(err) }
}

export const stopCampaign = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await DialerService.stopCampaign(Number(req.params.campaignId))
    return sendSuccess(res, null, 'Campaign dialing stopped')
  } catch (err) { return next(err) }
}

export const getActiveCampaigns = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaigns = DialerService.getActiveCampaigns()
    return sendSuccess(res, { activeCampaigns: campaigns }, 'Active campaigns fetched')
  } catch (err) { return next(err) }
}

export const getCampaignEngineStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await DialerService.getCampaignEngineStatus(Number(req.params.campaignId))
    return sendSuccess(res, result, 'Campaign engine status fetched')
  } catch (err) { return next(err) }
}

export const runCampaignEngineTick = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await DialerService.runCampaignEngineTick(Number(req.params.campaignId))
    return sendSuccess(res, result, 'Campaign engine tick completed')
  } catch (err) { return next(err) }
}

export const getNextPreviewContact = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await PreviewDialingService.getNextPreviewContact(
      Number(req.params.campaignId),
      req.user!.id,
    )
    return sendSuccess(res, result, 'Preview contact fetched')
  } catch (err) { return next(err) }
}

export const releasePreviewContact = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await PreviewDialingService.releasePreviewContact(
      Number(req.params.contactId),
      Number(req.params.campaignId),
    )
    return sendSuccess(res, result, 'Preview contact released')
  } catch (err) { return next(err) }
}

export const callPreviewContact = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await PreviewDialingService.callPreviewContact(
      Number(req.params.contactId),
      Number(req.params.campaignId),
      req.user!.id,
    )
    return sendSuccess(res, result, 'Preview call initiated')
  } catch (err) { return next(err) }
}

export const getAccessToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = TwilioService.generateAccessToken(req.user!.id, req.user!.email)
    return sendSuccess(res, { token }, 'Access token generated')
  } catch (err) { return next(err) }
}

export const twimlConnect = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callId = Number(req.params.callId)
    const agentId = await DialerService.routeCallToAgent(callId)
    const twiml = TwilioService.generateConnectTwiML(callId, agentId || undefined)
    res.type('text/xml')
    return res.send(twiml)
  } catch (err) { return next(err) }
}

export const twimlAgent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = Number(req.params.agentId)
    const twiml = TwilioService.generateAgentTwiML(agentId)
    res.type('text/xml')
    return res.send(twiml)
  } catch (err) { return next(err) }
}

export const webhookStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callId = Number(req.params.callId)
    await TwilioService.handleStatusWebhook(callId, req.body)
    return res.status(200).send('OK')
  } catch (err) {
    logger.error(`Webhook error: ${err}`)
    return res.status(200).send('OK')
  }
}

export const webhookRecording = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callId = Number(req.params.callId)
    await TwilioService.handleRecordingWebhook(callId, req.body)
    return res.status(200).send('OK')
  } catch (err) {
    logger.error(`Recording webhook error: ${err}`)
    return res.status(200).send('OK')
  }
}

export const webhookAMD = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callId = Number(req.params.callId)
    await TwilioService.handleAMDWebhook(callId, req.body)
    return res.status(200).send('OK')
  } catch (err) {
    logger.error(`AMD webhook error: ${err}`)
    return res.status(200).send('OK')
  }
}

export const makeManualCall = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { contactId, campaignId } = req.body
    if (!contactId || !campaignId) return sendError(res, 'contactId and campaignId required', 400)
    const result = await TwilioService.initiateCall(Number(contactId), Number(campaignId), req.user!.id)
    return sendSuccess(res, result, 'Call initiated')
  } catch (err) { return next(err) }
}

export const makeAdhocCall = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { phone, note } = req.body
    if (!phone) return sendError(res, 'phone number required', 400)
    const result = await TwilioService.initiateAdhocCall(String(phone).trim(), req.user!.id, note ? String(note) : undefined)
    return sendSuccess(res, result, 'Ad-hoc call initiated')
  } catch (err) { return next(err) }
}

export const sendDTMF = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { twilioCallSid, digits } = req.body
    if (!twilioCallSid || !digits) return sendError(res, 'twilioCallSid and digits required', 400)
    await TwilioService.sendDTMF(String(twilioCallSid), String(digits))
    return sendSuccess(res, null, 'DTMF sent')
  } catch (err) { return next(err) }
}

export const hangupCall = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { twilioCallSid } = req.body
    if (!twilioCallSid) return sendError(res, 'twilioCallSid required', 400)
    await TwilioService.hangupCall(twilioCallSid)
    return sendSuccess(res, null, 'Call hung up')
  } catch (err) { return next(err) }
}
