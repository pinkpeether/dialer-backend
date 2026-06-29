import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as OpsReportService from '../services/opsReport.service'
import * as NotificationJobsService from '../services/notificationJobs.service'

export const summary = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await OpsReportService.getOpsSummary(req.user)
    return sendSuccess(res, result, 'Ops summary fetched')
  } catch (err) {
    return next(err)
  }
}

export const runNotificationJobs = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await NotificationJobsService.runAllNotificationJobs()
    return sendSuccess(res, result, 'Notification jobs completed')
  } catch (err) {
    return next(err)
  }
}
