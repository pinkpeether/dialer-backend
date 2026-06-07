import { Response, NextFunction } from 'express'
import * as DialerService from '../services/dialer.service'
import * as ProviderCallService from '../services/providerCall.service'
import * as PreviewDialingService from '../services/previewDialing.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

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

export const makeManualCall = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { contactId, campaignId } = req.body
    if (!contactId || !campaignId) return sendError(res, 'contactId and campaignId required', 400)
    const result = await ProviderCallService.initiateCall(Number(contactId), Number(campaignId), req.user!.id)
    return sendSuccess(res, result, 'Call initiated')
  } catch (err) { return next(err) }
}

export const makeAdhocCall = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { phone, note } = req.body
    if (!phone) return sendError(res, 'phone number required', 400)
    const result = await ProviderCallService.initiateAdhocCall(String(phone).trim(), req.user!.id, note ? String(note) : undefined)
    return sendSuccess(res, result, 'Ad-hoc call initiated')
  } catch (err) { return next(err) }
}

export const sendDTMF = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { providerCallId, digits } = req.body
    if (!providerCallId || !digits) return sendError(res, 'providerCallId and digits required', 400)
    await ProviderCallService.sendDTMF(String(providerCallId), String(digits))
    return sendSuccess(res, null, 'DTMF sent')
  } catch (err) { return next(err) }
}

export const hangupCall = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { providerCallId } = req.body
    if (!providerCallId) return sendError(res, 'providerCallId required', 400)
    await ProviderCallService.hangupCall(providerCallId)
    return sendSuccess(res, null, 'Call hung up')
  } catch (err) { return next(err) }
}
