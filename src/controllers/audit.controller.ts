import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as AuditService from '../services/audit.service'

const getDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AuditService.listAuditLogs({
      action: req.query.action as string | undefined,
      entity: req.query.entity as string | undefined,
      actorId: req.query.actorId ? Number(req.query.actorId) : undefined,
      search: req.query.search as string | undefined,
      from: getDate(req.query.from),
      to: getDate(req.query.to),
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    })
    return sendSuccess(res, result, 'Audit logs fetched')
  } catch (err) {
    return next(err)
  }
}

export const detail = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const log = await AuditService.getAuditLogById(Number(req.params.id))
    return sendSuccess(res, log, 'Audit log fetched')
  } catch (err) {
    return next(err)
  }
}
