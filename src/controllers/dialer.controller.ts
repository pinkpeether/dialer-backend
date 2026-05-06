import { Request, Response, NextFunction } from 'express'
import * as DialerService   from '../services/dialer.service'
import * as TwilioService   from '../services/twilio.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest }      from '../middleware/auth'
import logger               from '../utils/logger'

// Start campaign dialing
export const startCampaign = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    await DialerService.startCampaign(Number(req.params.campaignId))
    return sendSuccess(res, null, 'Campaign dialing started')
  } catch (err) { return next(err) }
}

// Stop campaign dialing
export const stopCampaign = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    await DialerService.stopCampaign(Number(req.params.campaignId))
    return sendSuccess(res, null, 'Campaign dialing stopped')
  } catch (err) { return next(err) }
}

// Get active campaigns
export const getActiveCampaigns = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const campaigns = DialerService.getActiveCampaigns()
    return sendSuccess(res, { activeCampaigns: campaigns }, 'Active campaigns fetched')
  } catch (err) { return next(err) }
}

// Generate Twilio access token for agent softphone
export const getAccessToken = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const token = TwilioService.generateAccessToken(
      req.user!.id,
      req.user!.email
    )
    return sendSuccess(res, { token }, 'Access token generated')
  } catch (err) { return next(err) }
}

// TwiML — connect customer to agent
export const twimlConnect = async (
  req: Request, res: Response, next: NextFunction
) => {
  try {
    const callId  = Number(req.params.callId)
    const agentId = await DialerService.routeCallToAgent(callId)
    const twiml   = TwilioService.generateConnectTwiML(callId, agentId || undefined)

    res.type('text/xml')
    return res.send(twiml)
  } catch (err) { return next(err) }
}

// TwiML — agent browser softphone
export const twimlAgent = async (
  req: Request, res: Response, next: NextFunction
) => {
  try {
    const agentId = Number(req.params.agentId)
    const twiml   = TwilioService.generateAgentTwiML(agentId)

    res.type('text/xml')
    return res.send(twiml)
  } catch (err) { return next(err) }
}

// Webhook — call status update
export const webhookStatus = async (
  req: Request, res: Response, next: NextFunction
) => {
  try {
    const callId = Number(req.params.callId)
    await TwilioService.handleStatusWebhook(callId, req.body)
    return res.status(200).send('OK')
  } catch (err) {
    logger.error(`Webhook error: ${err}`)
    return res.status(200).send('OK') // Always 200 to Twilio
  }
}

// Webhook — recording available
export const webhookRecording = async (
  req: Request, res: Response, next: NextFunction
) => {
  try {
    const callId = Number(req.params.callId)
    await TwilioService.handleRecordingWebhook(callId, req.body)
    return res.status(200).send('OK')
  } catch (err) {
    logger.error(`Recording webhook error: ${err}`)
    return res.status(200).send('OK')
  }
}

// Webhook — AMD (voicemail detection)
export const webhookAMD = async (
  req: Request, res: Response, next: NextFunction
) => {
  try {
    const callId = Number(req.params.callId)
    await TwilioService.handleAMDWebhook(callId, req.body)
    return res.status(200).send('OK')
  } catch (err) {
    logger.error(`AMD webhook error: ${err}`)
    return res.status(200).send('OK')
  }
}

// Manual single call
export const makeManualCall = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { contactId, campaignId } = req.body
    if (!contactId || !campaignId) {
      return sendError(res, 'contactId and campaignId required', 400)
    }
    const result = await TwilioService.initiateCall(
      Number(contactId),
      Number(campaignId),
      req.user!.id
    )
    return sendSuccess(res, result, 'Call initiated')
  } catch (err) { return next(err) }
}

// Hangup call
export const hangupCall = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { twilioCallSid } = req.body
    if (!twilioCallSid) return sendError(res, 'twilioCallSid required', 400)
    await TwilioService.hangupCall(twilioCallSid)
    return sendSuccess(res, null, 'Call hung up')
  } catch (err) { return next(err) }
}