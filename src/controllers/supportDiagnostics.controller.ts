import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as SupportDiagnosticsService from '../services/supportDiagnostics.service'

export const getDiagnostics = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const diagnostics = await SupportDiagnosticsService.getSupportDiagnostics()
    return sendSuccess(res, diagnostics, 'Support diagnostics fetched')
  } catch (err) {
    return next(err)
  }
}

export const downloadDiagnostics = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const diagnostics = await SupportDiagnosticsService.getSupportDiagnostics()
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="ptdt-support-diagnostics-${timestamp}.json"`)
    return res.status(200).send(JSON.stringify(diagnostics, null, 2))
  } catch (err) {
    return next(err)
  }
}
