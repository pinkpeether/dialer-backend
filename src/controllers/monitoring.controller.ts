import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as MonitoringService from '../services/monitoring.service'
import { resetRuntimeMetrics } from '../services/runtimeMetrics.service'

export const summary = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await MonitoringService.getMonitoringSummary(req.user)
    return sendSuccess(res, result, 'Monitoring summary fetched')
  } catch (err) {
    return next(err)
  }
}

export const resetRuntime = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    resetRuntimeMetrics()
    return sendSuccess(res, { reset: true, resetAt: new Date().toISOString() }, 'Runtime monitoring metrics reset')
  } catch (err) {
    return next(err)
  }
}
