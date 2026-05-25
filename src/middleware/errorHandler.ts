import { Request, Response, NextFunction } from 'express'
import logger from '../utils/logger'
import { recordRuntimeError } from '../services/runtimeMetrics.service'

export class AppError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 500) {
    super(message)
    this.statusCode = statusCode
    Error.captureStackTrace(this, this.constructor)
  }
}

function getStatusCode(err: AppError | Error & { status?: number; statusCode?: number }) {
  if (err instanceof AppError) return err.statusCode
  return err.statusCode || err.status || 500
}

export const errorHandler = (
  err: AppError | Error & { status?: number; statusCode?: number },
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = getStatusCode(err)
  const safeStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500
  const isProduction = process.env.NODE_ENV === 'production'
  const message = err.message || 'Internal Server Error'

  recordRuntimeError(err, {
    method: req.method,
    path: req.originalUrl || req.path,
    statusCode: safeStatusCode,
  })

  logger.error(`${req.method} ${req.originalUrl || req.path} — ${message}`)

  return res.status(safeStatusCode).json({
    success: false,
    message: isProduction && safeStatusCode === 500 ? 'Internal Server Error' : message,
    ...(isProduction ? {} : { stack: err.stack }),
  })
}
