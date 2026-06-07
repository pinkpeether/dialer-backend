import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as SmsService from '../services/sms.service'

export const getConfig = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, SmsService.getSmsConfig(), 'SMS configuration fetched')
  } catch (err) {
    return next(err)
  }
}

export const sendSms = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await SmsService.sendSms({
      from: req.body.from,
      to: req.body.to,
      message: req.body.message,
    })
    return sendSuccess(res, result, 'SMS queued successfully')
  } catch (err) {
    return next(err)
  }
}

export const getStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await SmsService.getSmsStatus(String(req.params.messageId || ''))
    return sendSuccess(res, result, 'SMS status fetched')
  } catch (err) {
    return next(err)
  }
}
