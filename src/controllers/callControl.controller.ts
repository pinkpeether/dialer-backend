import { Request, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as CallControlService from '../services/callControl.service'

export const capabilities = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = CallControlService.getCapabilities()
    return sendSuccess(res, result, 'Call-control capabilities fetched')
  } catch (err) {
    return next(err)
  }
}

export const activeCalls = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CallControlService.getActiveCalls()
    return sendSuccess(res, result, 'Active calls fetched')
  } catch (err) {
    return next(err)
  }
}

export const runAction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CallControlService.runControlAction({
      action: String(req.params.action || ''),
      payload: req.body || {},
      actor: {
        id: req.user!.id,
        role: req.user!.role,
        email: req.user!.email,
      },
      ipAddress: req.ip,
    })

    return sendSuccess(res, result, 'Call-control action processed')
  } catch (err) {
    return next(err)
  }
}

export const supervisorJoinTwiml = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const room = String(req.query.room || req.body?.room || '')
    const mode = String(req.query.mode || req.body?.mode || 'whisper')
    const twiml = CallControlService.generateSupervisorJoinTwiml(room, mode)
    res.type('text/xml')
    return res.send(twiml)
  } catch (err) {
    return next(err)
  }
}
