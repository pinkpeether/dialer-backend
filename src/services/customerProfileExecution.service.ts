import type { UserRole } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'
import { buildCustomerProfileImpact } from './customerProfileImpact.service'

type Actor = { id: number; email?: string; role?: string }
type ExecuteInput = { confirmationPhrase?: string; dryRun?: boolean }

const CUSTOMER_USER_ROLES: UserRole[] = ['CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT']

const parseId = (value: number | string) => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid customer profile id', 400)
  return id
}

const requireSuperAdmin = (actor?: Actor) => {
  if (actor?.role !== 'SUPER_ADMIN') throw new AppError('Super Admin access required', 403)
}

export const executeCustomerProfileRemoval = async (accountIdRaw: number | string, input: ExecuteInput, actor?: Actor) => {
  requireSuperAdmin(actor)
  const accountId = parseId(accountIdRaw)
  const preview = await buildCustomerProfileImpact(accountId, actor)

  const providedPhrase = String(input.confirmationPhrase || '').trim()
  if (providedPhrase !== preview.confirmationPhrase) throw new AppError('Confirmation phrase does not match', 400)
  if (input.dryRun) return { dryRun: true, preview }

  const exclusiveUserIds = preview.users.exclusive.map(user => user.id)

  const changed = await prisma.$transaction(async tx => {
    const campaignIds = (await tx.campaign.findMany({
      where: { commercialAccountId: accountId },
      select: { id: true },
    })).map(item => item.id)

    const contactIds = campaignIds.length
      ? (await tx.contact.findMany({ where: { campaignId: { in: campaignIds } }, select: { id: true } })).map(item => item.id)
      : []

    const callIds = campaignIds.length
      ? (await tx.call.findMany({ where: { campaignId: { in: campaignIds } }, select: { id: true } })).map(item => item.id)
      : []

    const callbackOr = [
      ...(callIds.length ? [{ callId: { in: callIds } }] : []),
      ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
      ...(exclusiveUserIds.length ? [{ agentId: { in: exclusiveUserIds } }] : []),
    ]

    const result = {
      callbacks: callbackOr.length ? (await tx.callback.deleteMany({ where: { OR: callbackOr } })).count : 0,
      callTranscripts: callIds.length ? (await tx.callTranscript.deleteMany({ where: { callId: { in: callIds } } })).count : 0,
      callInsights: callIds.length ? (await tx.callInsight.deleteMany({ where: { callId: { in: callIds } } })).count : 0,
      aiCallLogs: (await tx.aiCallLog.deleteMany({ where: { commercialAccountId: accountId } })).count,
      callerIds: 0,
      calls: 0,
      contacts: 0,
      campaigns: 0,
      dncUserLinksCleared: 0,
      agentSessions: 0,
      usersRemoved: 0,
      accountRemoved: 0,
    }

    result.callerIds += campaignIds.length ? (await tx.spoofingNumber.deleteMany({ where: { campaignId: { in: campaignIds } } })).count : 0

    if (exclusiveUserIds.length) {
      result.callerIds += (await tx.spoofingNumber.deleteMany({ where: { userId: { in: exclusiveUserIds } } })).count
      result.agentSessions = (await tx.agentSession.deleteMany({ where: { agentId: { in: exclusiveUserIds } } })).count
      result.dncUserLinksCleared = (await tx.dNCList.updateMany({ where: { addedByUserId: { in: exclusiveUserIds } }, data: { addedByUserId: null } })).count
    }

    result.calls = callIds.length ? (await tx.call.deleteMany({ where: { id: { in: callIds } } })).count : 0
    result.contacts = contactIds.length ? (await tx.contact.deleteMany({ where: { id: { in: contactIds } } })).count : 0
    result.campaigns = campaignIds.length ? (await tx.campaign.deleteMany({ where: { id: { in: campaignIds } } })).count : 0

    if (exclusiveUserIds.length) {
      result.usersRemoved = (await tx.user.deleteMany({
        where: { id: { in: exclusiveUserIds }, role: { in: CUSTOMER_USER_ROLES } },
      })).count
    }

    await tx.commercialAccount.delete({ where: { id: accountId } })
    result.accountRemoved = 1

    return result
  })

  await logAuditEvent({
    actor,
    action: 'CUSTOMER_PROFILE_REMOVED',
    entity: 'CommercialAccount',
    entityId: accountId,
    metadata: {
      account: preview.account,
      changed,
      previewCounts: preview.counts,
      retainedUsers: preview.users.retained.map(user => ({ id: user.id, email: user.email, role: user.role })),
      storageNote: preview.storageNote,
    },
  })

  return {
    success: true,
    account: preview.account,
    changed,
    retainedUsers: preview.users.retained,
    storageNote: preview.storageNote,
  }
}
