import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'

type Actor = { id: number; email?: string; role?: string }
type CallerIdStatus = 'PENDING' | 'VERIFIED' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'REJECTED'

const NUMBER_RE = /^\+?[1-9]\d{1,14}$/
const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const CUSTOMER_CONTROL_ROLES = new Set(['CUSTOMER_ADMIN', 'MANAGER'])
const metaPrefix = 'ptdt:'

const normalizeNumber = (value: string) => value.replace(/[\s().-]/g, '').trim()
const isPlatformActor = (actor?: Actor) => Boolean(actor?.role && PLATFORM_ROLES.has(String(actor.role)))
const isCustomerControlActor = (actor?: Actor) => Boolean(actor?.role && CUSTOMER_CONTROL_ROLES.has(String(actor.role)))

const validateNumber = (value: string) => {
  const next = normalizeNumber(value)
  if (!NUMBER_RE.test(next)) throw new AppError('Caller ID must be digits with optional + prefix, for example +14155552671 or 14155552671', 400)
  return next
}

const buildMeta = (input: { accountId: number; status: CallerIdStatus; requestedByUserId?: number | null; approvedByUserId?: number | null }) => {
  const segments = ['accountId=' + input.accountId, 'status=' + input.status]
  if (input.requestedByUserId) segments.push('requestedBy=' + input.requestedByUserId)
  if (input.approvedByUserId) segments.push('approvedBy=' + input.approvedByUserId)
  return metaPrefix + segments.join(';')
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

async function customerMembership(actor: Actor, accountId?: number | string | null) {
  const where: any = { userId: actor.id, status: 'ACTIVE' }
  if (accountId) where.accountId = Number(accountId)
  const membership = await prisma.commercialAccountMembership.findFirst({ where, orderBy: { accountRole: 'asc' } })
  if (!membership) throw new AppError('Your account is not linked to an active commercial account. Ask PTDT Support to assign membership.', 403)
  return membership
}

export const dynamicCallerIdCreateService = {
  async request(actor: Actor, input: { accountId?: number | string | null; displayNumber: string; displayName?: string | null; provider?: string | null }) {
    if (!isPlatformActor(actor) && !isCustomerControlActor(actor)) throw new AppError('Only customer admins/managers can request new caller IDs', 403)
    const membership = await customerMembership(actor, input.accountId)
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
    await logAuditEvent({ actor, action: 'DYNAMIC_CALLER_ID_REQUESTED', entity: 'DynamicCallerId', entityId: created.id, metadata: { accountId: membership.accountId, displayNumber } })
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
    await logAuditEvent({ actor, action: 'DYNAMIC_CALLER_ID_CREATED_BY_ADMIN', entity: 'DynamicCallerId', entityId: created.id, metadata: { accountId, status } })
    return serialize(created)
  },
}
