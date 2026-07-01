import type { UserRole } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

type Actor = { id: number; email?: string; role?: string }
const CUSTOMER_USER_ROLES: UserRole[] = ['CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT']

const parseId = (value: number | string) => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid customer profile id', 400)
  return id
}

const requireSuperAdmin = (actor?: Actor) => {
  if (actor?.role !== 'SUPER_ADMIN') throw new AppError('Super Admin access required', 403)
}

const phraseForCode = (code: string) => `CONFIRM ${String(code || '').trim().toUpperCase()}`

export const buildCustomerProfileImpact = async (accountIdRaw: number | string, actor?: Actor) => {
  requireSuperAdmin(actor)
  const accountId = parseId(accountIdRaw)

  const account = await prisma.commercialAccount.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, code: true, status: true, email: true, phone: true, currency: true, createdAt: true },
  })
  if (!account) throw new AppError('Customer profile not found', 404)

  const memberships = await prisma.commercialAccountMembership.findMany({
    where: { accountId },
    select: {
      id: true,
      accountRole: true,
      status: true,
      userId: true,
      user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
    },
    orderBy: [{ accountRole: 'asc' }, { createdAt: 'desc' }],
  })

  const userIds = Array.from(new Set(memberships.map(item => item.userId)))
  const membershipCounts = userIds.length
    ? await prisma.commercialAccountMembership.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _count: { _all: true } })
    : []
  const countByUser = new Map(membershipCounts.map(item => [item.userId, item._count._all]))

  const exclusiveUsers = Array.from(new Map(memberships
    .filter(item => countByUser.get(item.userId) === 1 && CUSTOMER_USER_ROLES.includes(item.user.role))
    .map(item => [item.user.id, item.user])).values())

  const retainedUsers = Array.from(new Map(memberships
    .filter(item => !exclusiveUsers.some(user => user.id === item.userId))
    .map(item => [item.user.id, item.user])).values())

  const exclusiveUserIds = exclusiveUsers.map(user => user.id)

  const campaignIds = (await prisma.campaign.findMany({
    where: { commercialAccountId: accountId },
    select: { id: true },
  })).map(item => item.id)

  const contactIds = campaignIds.length
    ? (await prisma.contact.findMany({ where: { campaignId: { in: campaignIds } }, select: { id: true } })).map(item => item.id)
    : []

  const callIds = campaignIds.length
    ? (await prisma.call.findMany({ where: { campaignId: { in: campaignIds } }, select: { id: true } })).map(item => item.id)
    : []

  const callbackOr = [
    ...(callIds.length ? [{ callId: { in: callIds } }] : []),
    ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
    ...(exclusiveUserIds.length ? [{ agentId: { in: exclusiveUserIds } }] : []),
  ]

  const wallet = await prisma.commercialWallet.findUnique({ where: { accountId }, select: { id: true } })

  const [
    contacts,
    calls,
    callbacks,
    transcripts,
    insights,
    campaignCallerIds,
    userCallerIds,
    aiCallLogs,
    subscriptions,
    addons,
    paymentRequests,
    billingAlerts,
    walletTransactions,
    sessions,
  ] = await Promise.all([
    contactIds.length ? prisma.contact.count({ where: { id: { in: contactIds } } }) : Promise.resolve(0),
    callIds.length ? prisma.call.count({ where: { id: { in: callIds } } }) : Promise.resolve(0),
    callbackOr.length ? prisma.callback.count({ where: { OR: callbackOr } }) : Promise.resolve(0),
    callIds.length ? prisma.callTranscript.count({ where: { callId: { in: callIds } } }) : Promise.resolve(0),
    callIds.length ? prisma.callInsight.count({ where: { callId: { in: callIds } } }) : Promise.resolve(0),
    campaignIds.length ? prisma.spoofingNumber.count({ where: { campaignId: { in: campaignIds } } }) : Promise.resolve(0),
    exclusiveUserIds.length ? prisma.spoofingNumber.count({ where: { userId: { in: exclusiveUserIds } } }) : Promise.resolve(0),
    prisma.aiCallLog.count({ where: { commercialAccountId: accountId } }),
    prisma.commercialSubscription.count({ where: { accountId } }),
    prisma.commercialAccountAddon.count({ where: { accountId } }),
    prisma.commercialPaymentRequest.count({ where: { accountId } }),
    prisma.commercialBillingAlert.count({ where: { accountId } }),
    wallet ? prisma.commercialWalletTransaction.count({ where: { walletId: wallet.id } }) : Promise.resolve(0),
    exclusiveUserIds.length ? prisma.agentSession.count({ where: { agentId: { in: exclusiveUserIds } } }) : Promise.resolve(0),
  ])

  return {
    account,
    confirmationPhrase: phraseForCode(account.code),
    counts: {
      campaigns: campaignIds.length,
      contacts,
      calls,
      callbacks,
      callTranscripts: transcripts,
      callInsights: insights,
      callerIds: campaignCallerIds + userCallerIds,
      aiCallLogs,
      memberships: memberships.length,
      subscriptions,
      addons,
      paymentRequests,
      billingAlerts,
      walletTransactions,
      agentSessions: sessions,
      usersToRemove: exclusiveUsers.length,
      usersToRetain: retainedUsers.length,
    },
    users: { exclusive: exclusiveUsers, retained: retainedUsers },
    warning: 'This action cannot be undone. Audit history is preserved.',
    storageNote: 'Recording files in external storage are not physically changed in this version.',
  }
}
