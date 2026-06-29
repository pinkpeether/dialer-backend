import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { getLiveMonitoringAdvancedViews } from '../services/liveMonitoringAdvanced.service'

export const overview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : undefined
    const result = await getLiveMonitoringAdvancedViews(campaignId, req.user)
    return sendSuccess(res, result, 'Live monitoring advanced views fetched')
  } catch (err) {
    return next(err)
  }
}
