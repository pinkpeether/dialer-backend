import { Response, NextFunction, Request } from 'express'
import * as ContactService from '../services/contact.service'
import * as CallService from '../services/call.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

export const getAllContacts = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { campaignId, status, search, page, limit } = req.query
    const result = await ContactService.getAllContacts({
      campaignId: campaignId ? Number(campaignId) : undefined,
      status:     status     as string,
      search:     search     as string,
      page:       page  ? Number(page)  : 1,
      limit:      limit ? Number(limit) : 50,
    }, req.user)
    return sendSuccess(res, result, 'Contacts fetched')
  } catch (err) { return next(err) }
}

export const getContactById = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const contact = await ContactService.getContactById(Number(req.params.id), req.user)
    return sendSuccess(res, contact, 'Contact fetched')
  } catch (err) { return next(err) }
}

export const getContactCalls = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const contactId = Number(req.params.id)
    if (!Number.isFinite(contactId)) return sendError(res, 'Invalid contact ID', 400)

    const calls = await CallService.getCallsForContact(contactId, req.user)
    return sendSuccess(res, calls, 'Contact calls fetched')
  } catch (err) { return next(err) }
}

export const createContact = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const contact = await ContactService.createContact(req.body, req.user)
    return sendSuccess(res, contact, 'Contact created successfully', 201)
  } catch (err) { return next(err) }
}

export const updateContact = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const contact = await ContactService.updateContact(
      Number(req.params.id), req.body, req.user
    )
    return sendSuccess(res, contact, 'Contact updated successfully')
  } catch (err) { return next(err) }
}

export const deleteContact = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    await ContactService.deleteContact(Number(req.params.id), req.user)
    return sendSuccess(res, null, 'Contact deleted successfully')
  } catch (err) { return next(err) }
}

export const uploadCSV = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400)
    }

    const campaignId = Number(req.params.campaignId)
    if (isNaN(campaignId)) {
      return sendError(res, 'Invalid campaign ID', 400)
    }

    const result = await ContactService.uploadCSV(campaignId, req.file.buffer, req.user)
    return sendSuccess(res, result, 'CSV uploaded successfully')
  } catch (err) { return next(err) }
}

export const addToDNC = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { phone, reason } = req.body
    if (!phone) return sendError(res, 'Phone number required', 400)
    const entry = await ContactService.addToDNC(phone, reason)
    return sendSuccess(res, entry, 'Number added to DNC list')
  } catch (err) { return next(err) }
}

export const getContactStats = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const { campaignId } = req.query
    const stats = await ContactService.getContactStats(
      campaignId ? Number(campaignId) : undefined,
      req.user
    )
    return sendSuccess(res, stats, 'Contact stats fetched')
  } catch (err) { return next(err) }
}
