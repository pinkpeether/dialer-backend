import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { commercialControlService } from '../services/commercialControl.service'
import prisma from '../lib/prisma'

const idParam = (value: string) => Number(value)
const accountIdFromQuery = (value: unknown) => typeof value === 'string' && value.trim() ? Number(value) : undefined
const visibleSubscriptionStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRIAL'] as const
const lifecycleStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED'] as const

type LifecycleStatus = typeof lifecycleStatuses[number]

type SummaryWithCallerIdControl = {
  account?: { id?: number; status?: string }
  subscription?: unknown
  callerIdControl?: Record<string, unknown>
}

const normalizeCommercialStatus = (status?: string | null) => {
  if (status === 'ACTIVE') return 'ACTIVE'
  if (status === 'SUSPENDED') return 'SUSPENDED'
  if (status === 'ARCHIVED') return 'ARCHIVED'
  return 'INACTIVE'
}

const normalizeLifecycleStatus = (status?: string | null): LifecycleStatus => {
  const next = String(status || '').trim().toUpperCase()
  if (lifecycleStatuses.includes(next as LifecycleStatus)) return next as LifecycleStatus
  return 'INACTIVE'
}

const membershipStatusForLifecycle = (status: LifecycleStatus) => {
  if (status === 'SUSPENDED') return 'SUSPENDED'
  if (status === 'ARCHIVED') return 'INACTIVE'
  return 'ACTIVE'
}

const subscriptionStatusForLifecycle = (status: LifecycleStatus) => {
  if (status === 'ARCHIVED') return 'SUSPENDED'
  return status === 'ACTIVE' ? 'ACTIVE' : status === 'SUSPENDED' ? 'SUSPENDED' : 'INACTIVE'
}

const latestVisibleSubscription = async (accountId: number) => prisma.commercialSubscription.findFirst({
  where: { accountId, status: { in: visibleSubscriptionStatuses as any } },
  include: { plan: true, account: true },
  orderBy: { startsAt: 'desc' },
})

const accountScopedCallerIdControl = async (accountId: number, currentControl?: Record<string, unknown>) => {
  const callerIds = await prisma.spoofingNumber.findMany({
    where: {
      isVerified: true,
      providerRef: { contains: `accountId=${accountId};` },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  }).catch(() => [])

  const activeCallerIds = callerIds.filter(item => item.isActive)

  return {
    ...currentControl,
    verifiedCallerIds: callerIds.length,
    activeVerifiedCallerIds: activeCallerIds.length,
    availableNumbers: activeCallerIds.map(item => ({
      id: item.id,
      displayNumber: item.displayNumber,
      displayName: item.displayName,
      scope: item.scope,
      provider: item.provider,
    })),
  }
}

const withLatestSubscriptionStatus = async <T extends SummaryWithCallerIdControl>(summary: T) => {
  const accountId = Number(summary.account?.id)
  if (!accountId) return summary

  const subscription = await latestVisibleSubscription(accountId)
  const status = normalizeCommercialStatus(summary.account?.status === 'ARCHIVED' ? 'ARCHIVED' : subscription?.status || summary.account?.status)
  const callerIdControl = await accountScopedCallerIdControl(accountId, summary.callerIdControl)

  return {
    ...summary,
    account: summary.account ? { ...summary.account, status } : summary.account,
    subscription: subscription ? { ...subscription, status: status === 'ARCHIVED' ? 'SUSPENDED' : status } : summary.subscription,
    callerIdControl,
  }
}

const getLifecycleSummary = async (accountId: number) => withLatestSubscriptionStatus(await commercialControlService.getSummary(accountId))

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

export const listAccounts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const includeArchived = String(req.query.includeArchived || '').toLowerCase() === 'true'
    return sendSuccess(res, await commercialControlService.listAccounts({ includeArchived }), 'Commercial accounts fetched')
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

export const updateAccountLifecycle = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const accountId = idParam(req.params.accountId)
    const status = normalizeLifecycleStatus(req.body?.status)
    const account = await prisma.commercialAccount.findUnique({ where: { id: accountId }, select: { id: true, code: true } })
    if (!account) return res.status(404).json({ success: false, message: 'Commercial account not found' })
    if (account.code === 'PTDT_DEFAULT' && status === 'ARCHIVED') {
      return res.status(400).json({ success: false, message: 'Default commercial account cannot be archived.' })
    }

    await prisma.$transaction(async tx => {
      await tx.commercialAccount.update({ where: { id: accountId }, data: { status } })
      await tx.commercialAccountMembership.updateMany({ where: { accountId }, data: { status: membershipStatusForLifecycle(status) as any } })
      const subscription = await tx.commercialSubscription.findFirst({
        where: { accountId, status: { in: visibleSubscriptionStatuses as any } },
        orderBy: { startsAt: 'desc' },
      })
      if (subscription) {
        await tx.commercialSubscription.update({
          where: { id: subscription.id },
          data: { status: subscriptionStatusForLifecycle(status) as any, notes: req.body?.notes || subscription.notes },
        })
      }
    })

    return sendSuccess(res, await getLifecycleSummary(accountId), 'Commercial account lifecycle updated')
  } catch (err) {
    return next(err)
  }
}

export const finalDeleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const accountId = idParam(req.params.accountId)
    const confirmCode = String(req.body?.confirmCode || '').trim()
    const account = await prisma.commercialAccount.findUnique({
      where: { id: accountId },
      include: { wallet: { select: { id: true } } },
    })
    if (!account) return res.status(404).json({ success: false, message: 'Commercial account not found' })
    if (account.code === 'PTDT_DEFAULT') return res.status(400).json({ success: false, message: 'Default commercial account cannot be final deleted.' })
    if (confirmCode !== account.code) return res.status(400).json({ success: false, message: 'Type the exact account code to confirm final delete.' })

    const [transactions, paymentRequests, subscriptions, addons, alerts] = await Promise.all([
      account.wallet ? prisma.commercialWalletTransaction.count({ where: { walletId: account.wallet.id } }) : Promise.resolve(0),
      prisma.commercialPaymentRequest.count({ where: { accountId } }),
      prisma.commercialSubscription.count({ where: { accountId } }),
      prisma.commercialAccountAddon.count({ where: { accountId } }),
      prisma.commercialBillingAlert.count({ where: { accountId } }),
    ])

    const historyCount = transactions + paymentRequests + subscriptions + addons + alerts
    if (historyCount > 0) {
      return res.status(409).json({
        success: false,
        message: 'This account has commercial history. Archive it instead of final delete.',
        data: { transactions, paymentRequests, subscriptions, addons, alerts },
      })
    }

    await prisma.commercialAccount.delete({ where: { id: accountId } })
    return sendSuccess(res, { deleted: true, id: accountId, code: account.code }, 'Commercial account final deleted')
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
