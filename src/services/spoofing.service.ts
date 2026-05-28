import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'

type CallerIdScope = 'all' | 'user' | 'campaign'

type Actor = {
  id: number
  email?: string
  role?: string
}

export type CreateSpoofingInput = {
  userId?: number | null
  campaignId?: number | null
  displayNumber: string
  displayName?: string | null
  scope?: CallerIdScope
  isActive?: boolean
  isVerified?: boolean
  provider?: string | null
  providerRef?: string | null
}

export type UpdateSpoofingInput = Partial<CreateSpoofingInput>

type NormalizedSpoofingPayload = {
  userId: number | null
  campaignId: number | null
  displayNumber?: string
  displayName?: string | null
  scope: CallerIdScope
  isActive?: boolean
  isVerified?: boolean
  provider: string
  providerRef?: string | null
}

const E164_RE = /^\+[1-9]\d{1,14}$/
const ALLOWED_SCOPES = new Set<CallerIdScope>(['all', 'user', 'campaign'])
const BLOCKED_EXACT_NUMBERS = new Set(['911', '999', '112', '100', '101', '102', '15'])

const normalizeNumber = (value: string) => value.replace(/[\s().-]/g, '').trim()

const normalizeScope = (scope?: string | null): CallerIdScope => {
  const value = (scope || 'all').toLowerCase()

  if (value === 'all' || value === 'user' || value === 'campaign') {
    return value
  }

  throw new AppError('Invalid caller ID scope', 400)
}

const validateNumber = (displayNumber: string) => {
  const normalized = normalizeNumber(displayNumber)

  if (!E164_RE.test(normalized)) {
    throw new AppError('Caller ID must be in E.164 format, for example +14155552671', 400)
  }

  const digits = normalized.replace(/\D/g, '')
  if (BLOCKED_EXACT_NUMBERS.has(digits)) {
    throw new AppError('Emergency/service numbers are not allowed as caller ID', 400)
  }

  return normalized
}

const normalizePayload = (input: CreateSpoofingInput | UpdateSpoofingInput): NormalizedSpoofingPayload => {
  const scope = normalizeScope(input.scope)
  const displayNumber = input.displayNumber ? validateNumber(input.displayNumber) : undefined
  const provider = input.provider?.trim() || 'generic'

  if (!ALLOWED_SCOPES.has(scope)) {
    throw new AppError('Invalid caller ID scope', 400)
  }

  if (scope === 'all') {
    return {
      userId: null,
      campaignId: null,
      displayNumber,
      displayName: input.displayName,
      scope,
      isActive: input.isActive,
      isVerified: input.isVerified,
      provider,
      providerRef: input.providerRef,
    }
  }

  if (scope === 'user' && !input.userId) {
    throw new AppError('userId is required for user-scoped caller ID', 400)
  }

  if (scope === 'campaign' && !input.campaignId) {
    throw new AppError('campaignId is required for campaign-scoped caller ID', 400)
  }

  return {
    userId: scope === 'user' ? input.userId ?? null : null,
    campaignId: scope === 'campaign' ? input.campaignId ?? null : null,
    displayNumber,
    displayName: input.displayName,
    scope,
    isActive: input.isActive,
    isVerified: input.isVerified,
    provider,
    providerRef: input.providerRef,
  }
}

const toCreateData = (payload: NormalizedSpoofingPayload) => {
  if (!payload.displayNumber) {
    throw new AppError('displayNumber is required', 400)
  }

  return {
    userId: payload.userId,
    campaignId: payload.campaignId,
    displayNumber: payload.displayNumber,
    displayName: payload.displayName ?? null,
    scope: payload.scope,
    isActive: payload.isActive ?? true,
    isVerified: payload.isVerified ?? false,
    provider: payload.provider,
    providerRef: payload.providerRef ?? null,
  }
}

const toUpdateData = (payload: NormalizedSpoofingPayload) => ({
  userId: payload.userId,
  campaignId: payload.campaignId,
  ...(payload.displayNumber !== undefined ? { displayNumber: payload.displayNumber } : {}),
  ...(payload.displayName !== undefined ? { displayName: payload.displayName } : {}),
  scope: payload.scope,
  ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
  ...(payload.isVerified !== undefined ? { isVerified: payload.isVerified } : {}),
  provider: payload.provider,
  ...(payload.providerRef !== undefined ? { providerRef: payload.providerRef } : {}),
})

const audit = async (
  actor: Actor | undefined,
  action: string,
  entityId: number | string | null,
  metadata?: Record<string, unknown>,
) => {
  await logAuditEvent({
    actor,
    action,
    entity: 'CallerId',
    entityId: entityId === null ? undefined : String(entityId),
    metadata,
  })
}

export const spoofingService = {
  async getAll() {
    return prisma.spoofingNumber.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  async getById(id: number) {
    return prisma.spoofingNumber.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        campaign: { select: { id: true, name: true } },
      },
    })
  },

  async create(input: CreateSpoofingInput, actor?: Actor) {
    const payload = normalizePayload(input)
    const created = await prisma.spoofingNumber.create({ data: toCreateData(payload) as any })

    await audit(actor, 'CALLER_ID_CREATED', created.id, {
      displayNumber: created.displayNumber,
      scope: created.scope,
      provider: created.provider,
    })

    return created
  },

  async update(id: number, input: UpdateSpoofingInput, actor?: Actor) {
    const existing = await prisma.spoofingNumber.findUnique({ where: { id } })
    if (!existing) throw new AppError('Caller ID not found', 404)

    const payload = normalizePayload({
      userId: input.userId !== undefined ? input.userId : existing.userId,
      campaignId: input.campaignId !== undefined ? input.campaignId : existing.campaignId,
      displayNumber: input.displayNumber !== undefined ? input.displayNumber : existing.displayNumber,
      displayName: input.displayName !== undefined ? input.displayName : existing.displayName,
      scope: input.scope !== undefined ? input.scope : normalizeScope(existing.scope),
      isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
      isVerified: input.isVerified !== undefined ? input.isVerified : existing.isVerified,
      provider: input.provider !== undefined ? input.provider : existing.provider,
      providerRef: input.providerRef !== undefined ? input.providerRef : existing.providerRef,
    })

    const updated = await prisma.spoofingNumber.update({
      where: { id },
      data: toUpdateData(payload) as any,
    })

    await audit(actor, 'CALLER_ID_UPDATED', id, { changes: input })
    return updated
  },

  async delete(id: number, actor?: Actor) {
    const existing = await prisma.spoofingNumber.findUnique({ where: { id } })
    if (!existing) throw new AppError('Caller ID not found', 404)

    await prisma.spoofingNumber.delete({ where: { id } })
    await audit(actor, 'CALLER_ID_DELETED', id, { displayNumber: existing.displayNumber })

    return { deleted: true }
  },

  async verify(id: number, actor?: Actor) {
    const existing = await prisma.spoofingNumber.findUnique({ where: { id } })
    if (!existing) throw new AppError('Caller ID not found', 404)

    // Provider-agnostic: verification means admin confirms this number is allowed/verified by the active carrier/SIP provider.
    // Twilio-owned/verified checks can be added as a separate adapter without making this feature Twilio-only.
    const updated = await prisma.spoofingNumber.update({
      where: { id },
      data: {
        isVerified: true,
        providerRef: existing.providerRef || existing.provider,
      },
    })

    await audit(actor, 'CALLER_ID_VERIFIED', id, {
      displayNumber: updated.displayNumber,
      provider: updated.provider,
    })

    return updated
  },

  async getCallerIdForCall(userId?: number | null, campaignId?: number | null): Promise<string | null> {
    const candidates = await prisma.spoofingNumber.findMany({
      where: {
        isActive: true,
        isVerified: true,
        OR: [
          ...(campaignId ? [{ scope: 'campaign', campaignId }] : []),
          ...(userId ? [{ scope: 'user', userId }] : []),
          { scope: 'all', userId: null, campaignId: null },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 25,
    })

    const campaignMatch = campaignId
      ? candidates.find(item => item.scope === 'campaign' && item.campaignId === campaignId)
      : null
    if (campaignMatch) return campaignMatch.displayNumber

    const userMatch = userId ? candidates.find(item => item.scope === 'user' && item.userId === userId) : null
    if (userMatch) return userMatch.displayNumber

    const globalMatch = candidates.find(item => item.scope === 'all')
    return globalMatch?.displayNumber || null
  },
}