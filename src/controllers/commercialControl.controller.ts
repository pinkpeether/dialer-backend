import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { commercialControlService } from '../services/commercialControl.service'

const idParam = (value: string) => Number(value)
const accountIdFromQuery = (value: unknown) => typeof value === 'string' && value.trim() ? Number(value) : undefined

export const seedCatalog = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await commercialControlService.seedCatalog(req.user), 'Commercial catalog seeded')
  } catch (err) {
    return next(err)
  }
}

export const getCatalog = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await commercialControlService.getCatalog(), 'Commercial catalog fetched')
  } catch (err) {
    return next(err)
  }
}

export const getSummary = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await commercialControlService.getSummary(accountIdFromQuery(req.query.accountId)), 'Commercial summary fetched')
  } catch (err) {
    return next(err)
  }
}

export const listAccounts = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await commercialControlService.listAccounts(), 'Commercial accounts fetched')
  } catch (err) {
    return next(err)
  }
}

export const createAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await commercialControlService.createAccount(req.body, req.user), 'Commercial account created', 201)
  } catch (err) {
    return next(err)
  }
}

export const listPaymentRequests = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await commercialControlService.listPaymentRequests(accountIdFromQuery(req.query.accountId)), 'Payment requests fetched')
  } catch (err) {
    return next(err)
  }
}

export const createPaymentRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await commercialControlService.createPaymentRequest(req.body, req.user), 'Payment request submitted', 201)
  } catch (err) {
    return next(err)
  }
}

export const updatePaymentRequestStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(
      res,
      await commercialControlService.updatePaymentRequestStatus(idParam(req.params.id), req.body.status, req.user),
      'Payment request status updated',
    )
  } catch (err) {
    return next(err)
  }
}

export const activatePlan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(
      res,
      await commercialControlService.activatePlan(idParam(req.params.accountId), req.body, req.user),
      'Subscription plan updated',
    )
  } catch (err) {
    return next(err)
  }
}

export const setAddonStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(
      res,
      await commercialControlService.setAddonStatus(idParam(req.params.accountId), req.params.addonCode as any, req.body, req.user),
      'Add-on status updated',
    )
  } catch (err) {
    return next(err)
  }
}

export const topUpWallet = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(
      res,
      await commercialControlService.topUpWallet(idParam(req.params.accountId), req.body, req.user),
      'Wallet topped up',
    )
  } catch (err) {
    return next(err)
  }
}

export const updateThresholds = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(
      res,
      await commercialControlService.updateThresholds(idParam(req.params.accountId), req.body, req.user),
      'Billing thresholds updated',
    )
  } catch (err) {
    return next(err)
  }
}
