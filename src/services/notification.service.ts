import prisma from '../lib/prisma'

export const createNotification = async (data: {
  userId?: number | null
  type: string
  title: string
  body?: string | null
  metadata?: unknown
}) => {
  return prisma.notification.create({
    data: {
      userId: data.userId ?? null,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      metadata: data.metadata as object | undefined,
    },
  })
}

export const listNotifications = async (filters: {
  userId?: number
  includeGlobal?: boolean
  unreadOnly?: boolean
  page?: number
  limit?: number
}) => {
  const page = filters.page || 1
  const limit = Math.min(filters.limit || 50, 100)

  const where: Record<string, unknown> = {}
  if (filters.userId) {
    where.OR = filters.includeGlobal
      ? [{ userId: filters.userId }, { userId: null }]
      : [{ userId: filters.userId }]
  }
  if (filters.unreadOnly) where.readAt = null

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
  const total = await prisma.notification.count({ where })
  const unread = await prisma.notification.count({ where: { ...where, readAt: null } })

  return {
    notifications,
    unread,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}

export const markRead = async (id: number, userId?: number) => {
  return prisma.notification.updateMany({
    where: { id, ...(userId ? { OR: [{ userId }, { userId: null }] } : {}) },
    data: { readAt: new Date() },
  })
}

export const markAllRead = async (userId?: number) => {
  return prisma.notification.updateMany({
    where: userId ? { OR: [{ userId }, { userId: null }] } : {},
    data: { readAt: new Date() },
  })
}
