import { Request, Response, NextFunction } from 'express'
import { recordHttpRequest } from '../services/runtimeMetrics.service'

export const requestMetricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now()

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt
    const path = (req.originalUrl || req.path || '').split('?')[0]

    recordHttpRequest({
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs,
    })
  })

  next()
}
