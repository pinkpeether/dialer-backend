import { Response, NextFunction } from 'express'
import * as CampaignService from '../services/campaign.service'
import { sendSuccess } from '../utils/response'
import { AuthRequest } from '../middleware/auth'
import { queueManager } from '../services/queueManager'

export const getAllCampaigns = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { status, search, page, limit } = req.query
    const result = await CampaignService.getAllCampaigns({
      status: status as string,
      search: search as string,
      page:   page  ? Number(page)  : 1,
      limit:  limit ? Number(limit) : 20,
    }, req.user)
    return sendSuccess(res, result, 'Campaigns fetched')
  } catch (err) { return next(err) }
}

export const getCampaignById = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const campaign = await CampaignService.getCampaignById(Number(req.params.id), req.user)
    return sendSuccess(res, campaign, 'Campaign fetched')
  } catch (err) { return next(err) }
}

export const createCampaign = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const campaign = await CampaignService.createCampaign(req.body, req.user)
    return sendSuccess(res, campaign, 'Campaign created successfully', 201)
  } catch (err) { return next(err) }
}

export const updateCampaign = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const campaign = await CampaignService.updateCampaign(
      Number(req.params.id), req.body, req.user
    )
    return sendSuccess(res, campaign, 'Campaign updated successfully')
  } catch (err) { return next(err) }
}

export const deleteCampaign = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    await CampaignService.deleteCampaign(Number(req.params.id), req.user)
    return sendSuccess(res, null, 'Campaign deleted successfully')
  } catch (err) { return next(err) }
}

export const updateCampaignStatus = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const campaign = await CampaignService.updateCampaignStatus(
      Number(req.params.id), req.body.status, req.user, req.ip
    )

    if (campaign.status === 'ACTIVE') {
      await queueManager.initQueue(campaign.id)
    }
    if (campaign.status === 'PAUSED' || campaign.status === 'COMPLETED') {
      await queueManager.clear(campaign.id)
    }

    return sendSuccess(res, campaign, `Campaign ${req.body.status.toLowerCase()} successfully`)
  } catch (err) { return next(err) }
}

export const cloneCampaign = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const campaign = await CampaignService.cloneCampaign(Number(req.params.id), req.user)
    return sendSuccess(res, campaign, 'Campaign cloned successfully', 201)
  } catch (err) { return next(err) }
}

export const getCampaignStats = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const stats = await CampaignService.getCampaignStats(req.user)
    return sendSuccess(res, stats, 'Campaign stats fetched')
  } catch (err) { return next(err) }
}
