import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as CampaignManagementProService from '../services/campaignManagementPro.service'

const campaignIdFromParams = (req: AuthRequest) => Number(req.params.campaignId)

export const summary = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CampaignManagementProService.getCampaignManagementSummary(campaignIdFromParams(req))
    return sendSuccess(res, result, 'Campaign management summary fetched')
  } catch (err) {
    return next(err)
  }
}

export const getScript = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CampaignManagementProService.getCampaignScript(campaignIdFromParams(req))
    return sendSuccess(res, result, 'Campaign script fetched')
  } catch (err) {
    return next(err)
  }
}

export const updateScript = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CampaignManagementProService.updateCampaignScript(
      campaignIdFromParams(req),
      String(req.body.script || ''),
    )
    return sendSuccess(res, result, 'Campaign script updated')
  } catch (err) {
    return next(err)
  }
}

export const scriptPopup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CampaignManagementProService.getAgentScriptPopup(campaignIdFromParams(req), {
      contactId: req.body.contactId ? Number(req.body.contactId) : undefined,
      callId: req.body.callId ? Number(req.body.callId) : undefined,
      agentName: req.body.agentName ? String(req.body.agentName) : req.user?.email || 'Agent',
      stage: req.body.stage ? String(req.body.stage) : undefined,
    })
    return sendSuccess(res, result, 'Agent script popup generated')
  } catch (err) {
    return next(err)
  }
}

export const cloneCampaign = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CampaignManagementProService.cloneCampaignAdvanced(campaignIdFromParams(req), {
      includeContacts: Boolean(req.body.includeContacts),
      resetContactStatuses: req.body.resetContactStatuses !== false,
      name: req.body.name ? String(req.body.name) : undefined,
    })
    return sendSuccess(res, result, 'Campaign cloned')
  } catch (err) {
    return next(err)
  }
}

export const uploadContacts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'file is required' })

    const result = await CampaignManagementProService.importCampaignContacts(campaignIdFromParams(req), {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      maxRetries: req.body.maxRetries ? Number(req.body.maxRetries) : undefined,
      defaultStatus: req.body.defaultStatus === 'IN_QUEUE' ? 'IN_QUEUE' : 'PENDING',
      skipDnc: req.body.skipDnc !== 'false',
      skipDuplicates: req.body.skipDuplicates !== 'false',
    })
    return sendSuccess(res, result, 'Campaign contacts imported')
  } catch (err) {
    return next(err)
  }
}

export const getDialSettings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CampaignManagementProService.getDialSettings(campaignIdFromParams(req))
    return sendSuccess(res, result, 'Campaign dial settings fetched')
  } catch (err) {
    return next(err)
  }
}

export const updateDialSettings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CampaignManagementProService.updateDialSettings(campaignIdFromParams(req), req.body || {})
    return sendSuccess(res, result, 'Campaign dial settings updated')
  } catch (err) {
    return next(err)
  }
}

export const endReportPdf = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await CampaignManagementProService.buildEndOfCampaignPdfReport(campaignIdFromParams(req))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`)
    return res.send(report.buffer)
  } catch (err) {
    return next(err)
  }
}
