import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { administrationService, AddAccountMemberInput, UpdateAccountMemberInput } from '../services/administration.service'

const actorFromRequest = (req: AuthRequest) => req.user ? {
  id: req.user.id,
  email: req.user.email,
  role: req.user.role,
} : undefined

export const getMyAdministration = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await administrationService.getMyAdministration(actorFromRequest(req)), 'Administration profile fetched')
  } catch (err) {
    return next(err)
  }
}

export const getPlatformOverview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await administrationService.getPlatformOverview(actorFromRequest(req)), 'Platform administration overview fetched')
  } catch (err) {
    return next(err)
  }
}

export const listAccountMembers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await administrationService.listAccountMembers(req.params.accountId, actorFromRequest(req)), 'Account members fetched')
  } catch (err) {
    return next(err)
  }
}

export const addAccountMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(
      res,
      await administrationService.addAccountMember(req.params.accountId, req.body as AddAccountMemberInput, actorFromRequest(req)),
      'Account member assigned',
      201,
    )
  } catch (err) {
    return next(err)
  }
}

export const updateAccountMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(
      res,
      await administrationService.updateAccountMember(req.params.membershipId, req.body as UpdateAccountMemberInput, actorFromRequest(req)),
      'Account member updated',
    )
  } catch (err) {
    return next(err)
  }
}

export const suspendAccountMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(
      res,
      await administrationService.suspendAccountMember(req.params.membershipId, actorFromRequest(req)),
      'Account member suspended',
    )
  } catch (err) {
    return next(err)
  }
}

export const removeAccountMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(
      res,
      await administrationService.removeAccountMember(req.params.membershipId, actorFromRequest(req)),
      'Account member removed',
    )
  } catch (err) {
    return next(err)
  }
}
