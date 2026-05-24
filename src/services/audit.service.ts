import prisma from '../lib/prisma'

type Actor = { id: number; email?: string; role?: string } | undefined

const SECRET_KEYS = ['password', 'passwordHash', 'token', 'jwt', 'secret', 'sipPassword', 'authorization']

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sanitize)
  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(input)) {
    if (SECRET_KEYS.some(secret => key.toLowerCase().includes(secret.toLowerCase()))) {
      output[key] = '[redacted]'
    } else {
      output[key] = sanitize(item)
    }
  }
  return output
}

export const logAuditEvent = async (data: {
  actor?: Actor
  action: string
  entity: string
  entityId?: string | number | null
  metadata?: unknown
  ipAddress?: string | null
}) => {
  try {
    return await prisma.auditLog.create({
      data: {
        actorId: data.actor?.id,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId === undefined || data.entityId === null ? null : String(data.entityId),
        metadata: data.metadata === undefined ? undefined : sanitize(data.metadata) as object,
        ipAddress: data.ipAddress || null,
      },
    })
  } catch (err) {
    // Audit logging should not break live calling/disposition flows.
    if (process.env.NODE_ENV !== 'production') console.warn('[audit] failed', err)
    return null
  }
}

export const listAuditLogs = async (filters: {
  action?: string
  entity?: string
  actorId?: number
  search?: string
  from?: Date
  to?: Date
  page?: number
  limit?: number
}) => {
  const page = filters.page || 1
  const limit = Math.min(filters.limit || 50, 200)
  const where: Record<string, unknown> = {}

  if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' }
  if (filters.entity) where.entity = { contains: filters.entity, mode: 'insensitive' }
  if (filters.actorId) where.actorId = filters.actorId
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  if (filters.search) {
    where.OR = [
      { action: { contains: filters.search, mode: 'insensitive' } },
      { entity: { contains: filters.search, mode: 'insensitive' } },
      { entityId: { contains: filters.search, mode: 'insensitive' } },
      { ipAddress: { contains: filters.search, mode: 'insensitive' } },
    ]
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
  const total = await prisma.auditLog.count({ where })

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export const getAuditLogById = async (id: number) => {
  return prisma.auditLog.findUnique({ where: { id } })
}
