import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { sendError } from '../utils/response'

export type AuthUserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CUSTOMER_ADMIN'
  | 'MANAGER'
  | 'SUPERVISOR'
  | 'AGENT'
  | string

export interface AuthRequest extends Request {
  user?: {
    id: number
    email: string
    role: AuthUserRole
  }
}

const PLATFORM_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const CUSTOMER_ADMIN_ROLES = new Set(['CUSTOMER_ADMIN', 'MANAGER'])

export const isPlatformAdminRole = (role?: string | null) => Boolean(role && PLATFORM_ADMIN_ROLES.has(role))
export const isCustomerAdminRole = (role?: string | null) => Boolean(role && CUSTOMER_ADMIN_ROLES.has(role))

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return sendError(res, 'Unauthorized — No token provided', 401)
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: number; email: string; role: string
    }
    req.user = decoded
    return next()
  } catch {
    return sendError(res, 'Unauthorized — Invalid token', 401)
  }
}

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Forbidden — Insufficient permissions', 403)
    }

    if (req.user.role === 'SUPER_ADMIN') {
      return next()
    }

    if (!roles.includes(req.user.role)) {
      return sendError(res, 'Forbidden — Insufficient permissions', 403)
    }
    return next()
  }
}

export const authorizePlatformAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !isPlatformAdminRole(req.user.role)) {
    return sendError(res, 'Forbidden — PTDT platform admin access required', 403)
  }
  return next()
}

export const authorizeCustomerAdminOrPlatform = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || (!isPlatformAdminRole(req.user.role) && !isCustomerAdminRole(req.user.role))) {
    return sendError(res, 'Forbidden — customer admin access required', 403)
  }
  return next()
}
