import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'
import { AUDIT_ACTIONS } from '../constants/auditActions'

type AuditActor = { id: number; email?: string; role?: string }

export const getAllDnc = async (filters: {
  page?: number
  limit?: number
  search?: string
}) => {
  const { page = 1, limit = 50, search } = filters

  const where: Record<string, unknown> = {}
  if (search) {
    where.phone = { contains: search, mode: 'insensitive' }
  }

  const entries = await prisma.dNCList.findMany({
    where,
    select: {
      id:        true,
      phone:     true,
      reason:    true,
      createdAt: true,
      addedBy: {
        select: { id: true, name: true, agentCode: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip:  (page - 1) * limit,
    take:  limit,
  })
  const total = await prisma.dNCList.count({ where })

  return {
    entries,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export const checkDnc = async (phone: string): Promise<boolean> => {
  const entry = await prisma.dNCList.findUnique({
    where: { phone: normalizePhone(phone) },
  })
  return entry !== null
}

export const addToDnc = async (
  phone: string,
  reason: string | undefined,
  addedByUserId: number,
  actor?: AuditActor,
  ipAddress?: string | null
) => {
  const normalized = normalizePhone(phone)

  const existing = await prisma.dNCList.findUnique({ where: { phone: normalized } })
  if (existing) throw new AppError('Phone number is already on the DNC list', 409)

  const dnc = await prisma.dNCList.create({
    data: {
      phone:         normalized,
      reason:        reason ?? null,
      addedByUserId: addedByUserId,
    },
    select: {
      id:        true,
      phone:     true,
      reason:    true,
      createdAt: true,
      addedBy: { select: { id: true, name: true } },
    },
  })

  await logAuditEvent({
    actor,
    action: AUDIT_ACTIONS.DNC_ADD,
    entity: 'DNCList',
    entityId: dnc.id,
    metadata: { phone: dnc.phone },
    ipAddress,
  })

  return dnc
}

export const removeFromDnc = async (
  id: number,
  actor?: AuditActor,
  ipAddress?: string | null
) => {
  const existing = await prisma.dNCList.findUnique({ where: { id } })
  if (!existing) throw new AppError('DNC entry not found', 404)
  await prisma.dNCList.delete({ where: { id } })

  await logAuditEvent({
    actor,
    action: AUDIT_ACTIONS.DNC_REMOVE,
    entity: 'DNCList',
    entityId: id,
    metadata: { phone: existing.phone },
    ipAddress,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip spaces/dashes — keep + prefix intact so +92 is preserved */
const normalizePhone = (phone: string): string =>
  phone.replace(/[\s\-().]/g, '').trim()
