import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as SettingsService from '../services/settings.service'

export const getAll = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await SettingsService.getSettings()
    return sendSuccess(res, settings, 'Settings fetched')
  } catch (err) {
    return next(err)
  }
}

export const update = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await SettingsService.updateSettings(req.body || {}, req.user, req.ip)
    return sendSuccess(res, settings, 'Settings updated')
  } catch (err) {
    return next(err)
  }
}
