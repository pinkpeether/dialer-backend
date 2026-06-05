import { NextFunction, Response } from 'express'
import { AuthRequest } from './auth'
import { sendError } from '../utils/response'
import { securityAdminProService } from '../services/securityAdminPro.service'

export const adminIpWhitelistGuard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') return next()

    const clientIp = String(
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      req.ip ||
      ''
    ).split(',')[0].trim()

    const result = await securityAdminProService.isIpAllowed(clientIp)
    if (!result.allowed) {
      return sendError(res, `Admin IP not allowed by whitelist: ${clientIp}`, 403)
    }

    return next()
  } catch (error) {
    return sendError(res, error instanceof Error ? error.message : 'IP whitelist validation failed', 403)
  }
}
