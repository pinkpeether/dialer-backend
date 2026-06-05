import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as ContactManagementProService from '../services/contactManagementPro.service'

export const duplicates = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ContactManagementProService.getDuplicateContacts()
    return sendSuccess(res, result, 'Duplicate contacts fetched')
  } catch (err) {
    return next(err)
  }
}

export const timeline = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ContactManagementProService.getContactTimeline(Number(req.params.contactId))
    return sendSuccess(res, result, 'Contact timeline fetched')
  } catch (err) {
    return next(err)
  }
}

export const updateNotes = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ContactManagementProService.updateContactNotes(
      Number(req.params.contactId),
      String(req.body.notes || ''),
    )
    return sendSuccess(res, result, 'Contact notes updated')
  } catch (err) {
    return next(err)
  }
}

export const updateTags = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags.map(String) : []
    const result = await ContactManagementProService.updateContactTags(Number(req.params.contactId), tags)
    return sendSuccess(res, result, 'Contact tags updated')
  } catch (err) {
    return next(err)
  }
}

export const importPreview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ContactManagementProService.previewContactImport(
      Array.isArray(req.body.contacts) ? req.body.contacts : [],
      req.body.campaignId ? Number(req.body.campaignId) : undefined,
    )
    return sendSuccess(res, result, 'Contact import preview generated')
  } catch (err) {
    return next(err)
  }
}

export const exportCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const csv = await ContactManagementProService.exportContactsCsv({
      campaignId: req.query.campaignId ? Number(req.query.campaignId) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      tag: req.query.tag ? String(req.query.tag) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
    })

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ptdt-contacts-export.csv"')
    return res.send(csv)
  } catch (err) {
    return next(err)
  }
}
