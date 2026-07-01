import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import * as BaseScope from './teamUserScope.service'

type Actor = { id: number; email?: string; role?: string }
type TeamRole = 'CUSTOMER_ADMIN' | 'MANAGER' | 'SUPERVISOR' | 'AGENT'

const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const TEAM_ROLES: TeamRole[] = ['CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT']

const isPlatform = (actor?: Actor) => Boolean(actor?.role && PLATFORM_ROLES.has(String(actor.role)))

const normalizeRole = (value?: string): TeamRole | undefined => {
  if (!value) return undefined
  const role = value.trim().toUpperCase() as TeamRole
  if (!TEAM_ROLES.includes(role)) throw new AppError('Invalid team user role', 400)
  return role
}

const teamWhere = (filters: {
  role?: string
  status?: string
  isActive?: boolean
  search?: string
}, userIds: number[] | null) => {
  const role = normalizeRole(filters.role)
  const where: Record<string, unknown> = {
    role: role || { in: TEAM_ROLES },
  }

  if (userIds) where.id = { in: userIds.length ? userIds : [-1] }
  if (filters.status) where.status = filters.status
  if (filters.isActive !== undefined) where.isActive = filters.isActive

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { agentCode: { contains: filters.search, mode: 'insensitive' } },
      { extension: { contains: filters.search, mode: 'insensitive' } },
    ]
  }

  return where
}

export const listTeamUsersWithAccounts = async (filters: {
  role?: string
  status?: string
  isActive?: boolean
  search?: string
  page?: number
  limit?: number
}, actor?: Actor) => {
  const page = filters.page || 1
  const limit = filters.limit || 20
  const visibleIds = await BaseScope.getVisibleTeamUserIds(actor)
  const visibleAccountIds = !isPlatform(actor) && actor?.id ? await BaseScope.getActorAccountIds(actor) : null
  const where = teamWhere(filters, visibleIds)

  if (!isPlatform(actor)) {
    const role = String(actor?.role || '').toUpperCase()
    where.role = role === 'SUPERVISOR'
      ? 'AGENT'
      : { in: ['SUPERVISOR', 'AGENT'] }
  }

  const [agents, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        agentCode: true,
        name: true,
        email: true,
        role: true,
        extension: true,
        phone: true,
        status: true,
        isActive: true,
        createdAt: true,
        commercialMemberships: {
          where: {
            status: 'ACTIVE',
            ...(visibleAccountIds ? { accountId: { in: visibleAccountIds } } : {}),
          },
          select: {
            account: {
              select: {
                id: true,
                name: true,
                code: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { calls: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return {
    agents: agents.map(({ commercialMemberships, ...user }) => {
      const commercialAccounts = commercialMemberships
        .map(item => item.account)
        .filter(Boolean)
        .map(account => ({
          id: account.id,
          name: account.name,
          code: account.code,
          status: account.status,
        }))

      return {
        ...user,
        commercialAccounts,
        commercialAccount: commercialAccounts[0] || null,
      }
    }),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}
