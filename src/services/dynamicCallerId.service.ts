import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'

type Actor = { id: number; email?: string; role?: string }
type CallerIdStatus = 'PENDING' | 'VERIFIED' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'REJECTED'
type CallerIdScope = 'all' | 'user' | 'campaign'

const E164_RE = /^\+[1-9]\d{1,14}$/
const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const CUSTOMER_CONTROL_ROLES = new Set(['CUSTOMER_ADMIN', 'SUPERVISOR', 'MANAGER'])
const metaPrefix = 'ptdt:'

const normalizeNumber = (value: string) => value.replace(/[\s().-]/g, '').trim()
const isPlatformActor = (actor?: Actor) => Boolean(actor?.role && PLATFORM_ROLES.has(String(actor.role)))
const isCustomerControlActor = (actor?: Actor) => Boolean(actor?.role && CUSTOMER_CONTROL_ROLES.has(String(actor.role)))

const validateNumber = (value: string) => {
  const next = normalizeNumber(value)
  if (!E164_RE.test(next)) throw new AppError('Caller ID must be in E.164 format, for example +14155552671', 400)
  return next
}

const parseMeta = (providerRef?: string | null) => {
  const fallback = { accountId: null as number | null, status: 'PENDING' as CallerIdStatus, requestedByUserId: null as number | null, approvedByUserId: null as number | null }
  if (!providerRef?.startsWith(metaPrefix)) return fallback
  const parts = Object.fromEntries(providerRef.slice(metaPrefix.length).split(';').map(item => {
    const [key, ...rest] = item.split('=')
    return [key, rest.join('=')]
  }))
  const status = String(parts.status || fallback.status).toUpperCase() as CallerIdStatus
  return {
    accountId: parts.accountId ? Number(parts.accountId) : null,
    status: ['PENDING', 'VERIFIED', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REJECTED'].includes(status) ? status : fallback.status,
    requestedByUserId: parts.requestedBy ? Number(parts.requestedBy) : null,
    approvedByUserId: parts.approvedBy ? Number(parts.approvedBy) : null,
  }
}

const buildMeta = (input: { accountId: number; status: CallerIdStatus; requestedByUserId?: number | null; approvedByUserId?: number | null }) => {
  const segments = [`accountId=${input.accountId}`, `status=${input.status}`]
  if (input.requestedByUserId) segments.push(`requestedBy=${input.requestedByUserId}`)
  if (input.approvedByUserId) segments.push(`approvedBy=${input.approvedByUserId}`)
  return `${metaPrefix}${segments.join(';')}`
}

const serialize = (record: any) => {
  const meta = parseMeta(record.providerRef)
  return {
    ...record,
    commercialAccountId: meta.accountId,
    approvalStatus: meta.status,
    requestedByUserId: meta.requestedByUserId,
    approvedByUserId: meta.approvedByUserId,
    isUsable: Boolean(record.isActive && record.isVerified && meta.status === 'ACTIVE'),
  }
}

const audit = async (actor: Actor | undefined, action: string, entityId: number | string | null, metadata?: Record<string, unknown>) => {
  await logAuditEvent({ actor, action, entity: 'DynamicCallerId', entityId: entityId === null ? undefined : String(entityId), metadata })
}

async function getMembershipForActor(actor: Actor, accountId?: number | string | null) {
  if (isPlatformActor(actor)) {
    if (!accountId) return null
    const account = await prisma.commercialAccount.findUnique({ where: { id: Number(accountId) } })
    if (!account) throw new AppError('Commercial account not found', 404)
    return { accountId: account.id, userId: actor.id, accountRole: 'PLATFORM', status: 'ACTIVE', canUseDynamicCallerId: true, canManageUsers: true, account }
  }

  const where: Record<string, unknown> = { userId: actor.id, status: 'ACTIVE' }
  if (accountId) where.accountId = Number(accountId)
  const membership = await prisma.commercialAccountMembership.findFirst({
    where,
    include: { account: { include: { wallet: true, addons: { include: { addon: true } } } } },
    orderBy: { accountRole: 'asc' },
  })
  if (!membership) throw new AppError('Your account is not linked to an active commercial account. Ask PTDT Support to assign membership.', 403)
  return membership
}

async function assertDynamicCallerIdEnabled(accountId: number) {
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

async function listAccountCallerIds(accountId: number) {
  const records = await prisma.spoofingNumber.findMany({
    where: { providerRef: { contains: `accountId=${accountId}` } },
    include: { user: { select: { id: true, email: true, name: true } }, campaign: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return records.map(serialize)
}

export const dynamicCallerIdService = {
  async getSummary(actor: Actor, accountId?: number | string | null) {
    const membership = await getMembershipForActor(actor, accountId)
    const effectiveAccountId = membership?.accountId || (accountId ? Number(accountId) : null)
    if (!effectiveAccountId) throw new AppError('accountId is required for platform admins', 400)
    const account = await prisma.commercialAccount.findUnique({
      where: { id: effectiveAccountId },
      include: { wallet: true, addons: { include: { addon: true } } },
    })
    if (!account) throw new AppError('Commercial account not found', 404)
    const addon = account.addons.find(item => item.addon.code === 'DYNAMIC_CALLER_ID')
    const callerIds = await listAccountCallerIds(account.id)
    return {
      account: { id: account.id, name: account.name, code: account.code, status: account.status, currency: account.currency },
      addonActive: addon?.status === 'ACTIVE',
      membership: membership ? { accountRole: membership.accountRole, canUseDynamicCallerId: Boolean((membership as any).canUseDynamicCallerId) || isCustomerControlActor(actor), canRequestCallerIds: isPlatformActor(actor) || isCustomerControlActor(actor) } : { accountRole: 'PLATFORM', canUseDynamicCallerId: true, canRequestCallerIds: true },
      balanceState: Number(account.wallet?.availableBalance || 0) <= 0 && account.hardStopEnabled ? 'HARD_STOP' : 'OK',
      callerIds,
      availableNumbers: callerIds.filter(item => item.isUsable),
    }
  },

  async list(actor: Actor, accountId?: number | string | null) {
    if (isPlatformActor(actor) && !accountId) {
      const records = await prisma.spoofingNumber.findMany({
        where: { providerRef: { startsWith: metaPrefix } },
        include: { user: { select: { id: true, email: true, name: true } }, campaign: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return records.map(serialize)
    }
    const membership = await getMembershipForActor(actor, accountId)
    if (!membership?.accountId) throw new AppError('Commercial account membership is required', 403)
    return listAccountCallerIds(membership.accountId)
  },

  async request(actor: Actor, input: { accountId?: number | string | null; displayNumber: string; displayName?: string | null; provider?: string | null; notes?: string | null }) {
    const membership = await getMembershipForActor(actor, input.accountId)
    if (!membership?.accountId) throw new AppError('Commercial account membership is required', 403)
    if (!isPlatformActor(actor) && !isCustomerControlActor(actor)) throw new AppError('Only customer admins/managers can request new caller IDs', 403)
    const displayNumber = validateNumber(input.displayNumber)
    const created = await prisma.spoofingNumber.create({
      data: {
        userId: actor.id,
        campaignId: null,
        displayNumber,
        displayName: input.displayName || null,
        scope: 'all',
        isActive: false,
        isVerified: false,
        provider: input.provider?.trim() || 'dynamic-caller-id',
        providerRef: buildMeta({ accountId: membership.accountId, status: 'PENDING', requestedByUserId: actor.id }),
      } as any,
    })
    await audit(actor, 'DYNAMIC_CALLER_ID_REQUESTED', created.id, { accountId: membership.accountId, displayNumber })
    return serialize(created)
  },

  async adminCreate(actor: Actor, input: { accountId: number | string; displayNumber: string; displayName?: string | null; provider?: string | null; status?: CallerIdStatus }) {
    if (!isPlatformActor(actor)) throw new AppError('PTDT platform admin access required', 403)
    const accountId = Number(input.accountId)
    const account = await prisma.commercialAccount.findUnique({ where: { id: accountId } })
    if (!account) throw new AppError('Commercial account not found', 404)
    const status = input.status || 'ACTIVE'
    const created = await prisma.spoofingNumber.create({
      data: {
        userId: null,
        campaignId: null,
        displayNumber: validateNumber(input.displayNumber),
        displayName: input.displayName || null,
        scope: 'all',
        isActive: status === 'ACTIVE',
        isVerified: ['VERIFIED', 'ACTIVE'].includes(status),
        provider: input.provider?.trim() || 'dynamic-caller-id',
        providerRef: buildMeta({ accountId, status, approvedByUserId: actor.id }),
      } as any,
    })
    await audit(actor, 'DYNAMIC_CALLER_ID_CREATED_BY_ADMIN', created.id, { accountId, status })
    return serialize(created)
  },

  async setStatus(actor: Actor, id: number | string, status: CallerIdStatus) {
    if (!isPlatformActor(actor)) throw new AppError('PTDT platform admin access required', 403)
    const record = await prisma.spoofingNumber.findUnique({ where: { id: Number(id) } })
    if (!record) throw new AppError('Dynamic Caller ID not found', 404)
    const meta = parseMeta(record.providerRef)
    if (!meta.accountId) throw new AppError('Caller ID is not linked to a commercial account', 400)
    const updated = await prisma.spoofingNumber.update({
      where: { id: Number(id) },
      data: {
        isVerified: ['VERIFIED', 'ACTIVE'].includes(status),
        isActive: status === 'ACTIVE',
        providerRef: buildMeta({ accountId: meta.accountId, status, requestedByUserId: meta.requestedByUserId, approvedByUserId: actor.id }),
      },
    })
    await audit(actor, 'DYNAMIC_CALLER_ID_STATUS_UPDATED', updated.id, { accountId: meta.accountId, status })
    return serialize(updated)
  },

  async resolveForCall(actor: Actor, selectedCallerIdId?: number | string | null) {
    if (!selectedCallerIdId) return null
    const membership = await getMembershipForActor(actor, null)
    if (!membership?.accountId) throw new AppError('Commercial account membership is required for Dynamic Caller ID', 403)
    if (!isPlatformActor(actor) && !(membership as any).canUseDynamicCallerId && !isCustomerControlActor(actor)) throw new AppError('Your account is not allowed to use Dynamic Caller ID', 403)
    await assertDynamicCallerIdEnabled(membership.accountId)
    const record = await prisma.spoofingNumber.findUnique({ where: { id: Number(selectedCallerIdId) } })
    if (!record) throw new AppError('Selected Caller ID not found', 404)
    const meta = parseMeta(record.providerRef)
    if (meta.accountId !== membership.accountId) throw new AppError('Selected Caller ID does not belong to your customer account', 403)
    if (!(record.isActive && record.isVerified && meta.status === 'ACTIVE')) throw new AppError('Selected Caller ID is not active/verified', 403)
    await audit(actor, 'DYNAMIC_CALLER_ID_USED_FOR_CALL', record.id, { accountId: membership.accountId, displayNumber: record.displayNumber })
    return record.displayNumber
  },
}
