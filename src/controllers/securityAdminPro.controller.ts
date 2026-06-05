import { Request, Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendError, sendSuccess } from '../utils/response'
import { securityAdminProService } from '../services/securityAdminPro.service'

export const securityAdminProController = {
  async overview(_req: Request, res: Response) {
    try {
      const data = await securityAdminProService.getSecurityOverview()
      return sendSuccess(res, data, 'Security overview loaded')
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to load security overview', 500)
    }
  },

  async checklist(_req: Request, res: Response) {
    try {
      const data = await securityAdminProService.getHardeningChecklist()
      return sendSuccess(res, data, 'Security hardening checklist loaded')
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to load checklist', 500)
    }
  },

  async getPolicy(_req: Request, res: Response) {
    try {
      const data = await securityAdminProService.getPolicy()
      return sendSuccess(res, data, 'Security policy loaded')
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to load policy', 500)
    }
  },

  async updatePolicy(req: AuthRequest, res: Response) {
    try {
      const data = await securityAdminProService.updatePolicy(req.user?.id, req.body || {})
      return sendSuccess(res, data, 'Security policy updated')
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to update policy', 400)
    }
  },

  async singleSessionAudit(_req: Request, res: Response) {
    try {
      const data = await securityAdminProService.getSingleSessionAudit()
      return sendSuccess(res, data, 'Single-session audit loaded')
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to load single-session audit', 500)
    }
  },

  async disconnectStaleSessions(req: AuthRequest, res: Response) {
    try {
      const data = await securityAdminProService.disconnectStaleSessions(req.user?.id)
      return sendSuccess(res, data, 'Stale duplicate sessions disconnected')
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to disconnect stale sessions', 400)
    }
  },

  async billing(_req: Request, res: Response) {
    try {
      const data = await securityAdminProService.getBillingOverview()
      return sendSuccess(res, data, 'Billing overview loaded')
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to load billing overview', 500)
    }
  },

  async exportBackup(req: AuthRequest, res: Response) {
    try {
      const data = await securityAdminProService.getBackupExport(req.user?.id)
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename="ptdt-dialer-backup-${Date.now()}.json"`)
      return res.status(200).json(data)
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to export backup', 400)
    }
  },

  async restorePreview(req: Request, res: Response) {
    try {
      const data = await securityAdminProService.previewRestore(req.body)
      return sendSuccess(res, data, 'Restore preview completed')
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to preview restore', 400)
    }
  },

  async ipCheck(req: Request, res: Response) {
    try {
      const ip = String(req.query.ip || req.ip || '')
      const data = await securityAdminProService.isIpAllowed(ip)
      return sendSuccess(res, { ip, ...data }, 'IP whitelist check completed')
    } catch (error) {
      return sendError(res, error instanceof Error ? error.message : 'Unable to check IP', 400)
    }
  },
}
