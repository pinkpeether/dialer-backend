import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { commercialControlService } from '../services/commercialControl.service'
import prisma from '../lib/prisma'

const idParam = (value: string) => Number(value)
const accountIdFromQuery = (value: unknown) => typeof value === 'string' && value.trim() ? Number(value) : undefined
const visibleSubscriptionStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRIAL'] as const

const normalizeCommercialStatus = (status?: string | null) => {
  if (status === 'ACTIVE') return 'ACTIVE'
  if (status === 'SUSPENDED') return 'SUSPENDED'
  return 'INACTIVE'
}

const latestVisibleSubscription = async (accountId: number) => prisma.commercialSubscription.findFirst({
  where: { accountId, status: { in: visibleSubscriptionStatuses as any } },
  include: { plan: true, account: true },
  orderBy: { startsAt: 'desc' },
})

const withLatestSubscriptionStatus = async <T extends { account?: { id?: number; status?: string }; subscription?: unknown }>(summary: T) => {
  const accountId = Number(summary.account?.id)
  if (!accountId) return summary

  const subscription = await latestVisibleSubscription(accountId)
  const status = normalizeCommercialStatus(subscription?.status || summary.account?.status)

  return {
    ...summary,
    account: summary.account ? { ...summary.account, status } : summary.account,
    subscription: subscription ? { ...subscription, status } : summary.subscription,
  }
}

export const seedCatalog = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, await withLatestSubscriptionStatus(await commercialControlService.seedCatalog(req.user)), 'Commercial catalog seeded')
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
    const summary = await commercialControlService.getSummary(accountIdFromQuery(req.query.accountId))
    return sendSuccess(res, await withLatestSubscriptionStatus(summary), 'Commercial summary fetched')
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
    const accountId = idParam(req.params.accountId)
    const status = normalizeCommercialStatus(req.body?.status)
    const subscription = await commercialControlService.activatePlan(accountId, { ...req.body, status }, req.user)

    await prisma.commercialSubscription.updateMany({
      where: {
        accountId,
        id: { not: subscription.id },
        status: { in: visibleSubscriptionStatuses as any },
      },
      data: { status: 'EXPIRED' as any, endsAt: new Date() },
    })

    await prisma.commercialAccount.update({
      where: { id: accountId },
      data: { status: status as any },
    })

    const refreshed = await prisma.commercialSubscription.findUnique({
      where: { id: subscription.id },
      include: { plan: true, account: true },
    })

    return sendSuccess(
      res,
      refreshed ? { ...refreshed, status, account: { ...refreshed.account, status } } : { ...subscription, status },
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
