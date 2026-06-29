import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'

type Actor = { id: number; email?: string; role?: string }
const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const CUSTOMER_CALLER_ID_ROLES = new Set(['CUSTOMER_ADMIN', 'SUPERVISOR', 'MANAGER'])
const metaPrefix = 'ptdt:'

const isPlatformActor = (actor?: Actor) => Boolean(actor?.role && PLATFORM_ROLES.has(String(actor.role)))
const canUseByRole = (actor?: Actor) => Boolean(actor?.role && CUSTOMER_CALLER_ID_ROLES.has(String(actor.role)))

const parseMeta = (providerRef?: string | null) => {
  const fallback = { accountId: null as number | null, status: 'PENDING' }
  if (!providerRef?.startsWith(metaPrefix)) return fallback
  const parts = Object.fromEntries(providerRef.slice(metaPrefix.length).split(';').map(item => {
    const [key, ...rest] = item.split('=')
    return [key, rest.join('=')]
  }))
  return {
    accountId: parts.accountId ? Number(parts.accountId) : null,
    status: String(parts.status || fallback.status).toUpperCase(),
  }
}

async function assertAccountEnabled(accountId: number) {
  const account = await prisma.commercialAccount.findUnique({
    where: { id: accountId },
    include: { wallet: true, addons: { include: { addon: true } } },
  })
  if (!account) throw new AppError('Commercial account not found', 404)
  if (account.status !== 'ACTIVE') throw new AppError('Commercial account is not active', 403)
  const addon = account.addons.find(item => item.addon.code === 'DYNAMIC_CALLER_ID')
  if (addon?.status !== 'ACTIVE') throw new AppError('Dynamic Caller ID add-on is not active for this customer account', 403)
  const balance = Number(account.wallet?.availableBalance || 0)
  if (account.hardStopEnabled && balance <= 0) throw new AppError('Calling wallet is depleted. Top up balance before using Dynamic Caller ID.', 402)
  return account
}

export async function resolveDynamicCallerIdForCall(actor: Actor, selectedCallerIdId?: number | string | null) {
  if (!selectedCallerIdId) return null
  const record = await prisma.spoofingNumber.findUnique({ where: { id: Number(selectedCallerIdId) } })
  if (!record) throw new AppError('Selected Caller ID not found', 404)

  const meta = parseMeta(record.providerRef)
  if (!meta.accountId) throw new AppError('Selected Caller ID is not linked to a commercial account', 400)
  if (!(record.isActive && record.isVerified && meta.status === 'ACTIVE')) throw new AppError('Selected Caller ID is not active/verified', 403)

  if (!isPlatformActor(actor)) {
    const membership = await prisma.commercialAccountMembership.findFirst({
      where: { userId: actor.id, accountId: meta.accountId, status: 'ACTIVE' },
    })
    if (!membership) throw new AppError('Selected Caller ID does not belong to your customer account', 403)
    if (!membership.canUseDynamicCallerId && !canUseByRole(actor)) throw new AppError('Your account is not allowed to use Dynamic Caller ID', 403)
  }

  await assertAccountEnabled(meta.accountId)
  await logAuditEvent({
    actor,
    action: 'DYNAMIC_CALLER_ID_USED_FOR_CALL',
    entity: 'DynamicCallerId',
    entityId: record.id,
    metadata: { accountId: meta.accountId, displayNumber: record.displayNumber },
  })
  return record.displayNumber
}
