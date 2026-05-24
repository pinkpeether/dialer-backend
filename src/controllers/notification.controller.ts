import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as NotificationService from '../services/notification.service'

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await NotificationService.listNotifications({
      userId: req.user?.id,
      includeGlobal: true,
      unreadOnly: req.query.unreadOnly === 'true',
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    })
    return sendSuccess(res, result, 'Notifications fetched')
  } catch (err) {
    return next(err)
  }
}

export const markRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await NotificationService.markRead(Number(req.params.id), req.user?.id)
    return sendSuccess(res, null, 'Notification marked read')
  } catch (err) {
    return next(err)
  }
}

export const markAllRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await NotificationService.markAllRead(req.user?.id)
    return sendSuccess(res, null, 'Notifications marked read')
  } catch (err) {
    return next(err)
  }
}
