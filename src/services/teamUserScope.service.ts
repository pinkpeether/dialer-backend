import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import * as AgentService from './agent.service'

type Actor = { id: number; email?: string; role?: string }
type TeamRole = 'CUSTOMER_ADMIN' | 'MANAGER' | 'SUPERVISOR' | 'AGENT'
type TeamStatus = 'ONLINE' | 'READY' | 'BUSY' | 'WRAP_UP' | 'OFFLINE'

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

export const getActorAccountIds = async (actor?: Actor, requireManageUsers = false) => {
  if (!actor?.id) throw new AppError('Unauthorized', 401)
  const rows = await prisma.commercialAccountMembership.findMany({
    where: {
      userId: actor.id,
      status: 'ACTIVE',
      ...(requireManageUsers ? { canManageUsers: true } : {}),
    },
    select: { accountId: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(item => item.accountId)
}

export const getVisibleTeamUserIds = async (actor?: Actor) => {
  if (isPlatform(actor)) return null
  if (!actor?.id) throw new AppError('Unauthorized', 401)

  const accountIds = await getActorAccountIds(actor)
  if (!accountIds.length) return [actor.id]

  const rows = await prisma.commercialAccountMembership.findMany({
    where: { accountId: { in: accountIds }, status: 'ACTIVE' },
    select: { userId: true },
  })

  return Array.from(new Set([actor.id, ...rows.map(item => item.userId)]))
}

export const assertTeamUserAccess = async (actor: Actor | undefined, userId: number) => {
  if (isPlatform(actor)) return
  const visibleIds = await getVisibleTeamUserIds(actor)
  if (!visibleIds?.includes(userId)) throw new AppError('Team user access denied for this commercial account', 403)
}

export const listTeamUsers = async (filters: {
  role?: string
  status?: string
  isActive?: boolean
  search?: string
  page?: number
  limit?: number
}, actor?: Actor) => {
  const page = filters.page || 1
  const limit = filters.limit || 20
  const visibleIds = await getVisibleTeamUserIds(actor)
  const where = teamWhere(filters, visibleIds)

  // Operational team pages should not list customer owners/main Customer Admins.
  // Customer Admin sees Supervisors + Agents. Supervisor sees Agents only.
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
        _count: { select: { calls: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return {
    agents,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}

const accountRoleForTeamRole = (role?: string) => {
  if (role === 'CUSTOMER_ADMIN' || role === 'MANAGER') return 'ADMIN'
  if (role === 'SUPERVISOR') return 'SUPERVISOR'
  return 'AGENT'
}

const autoAttachToActorAccount = async (createdUserId: number, actor?: Actor, role?: string) => {
  if (isPlatform(actor)) return
  const accountIds = await getActorAccountIds(actor, true)
  if (!accountIds.length) throw new AppError('Your account is not allowed to create team users. Ask PTDT Support to assign account membership.', 403)

  const accountId = accountIds[0]
  const accountRole = accountRoleForTeamRole(role)

  await prisma.commercialAccountMembership.upsert({
    where: { accountId_userId: { accountId, userId: createdUserId } },
    update: { status: 'ACTIVE', accountRole: accountRole as never },
    create: {
      accountId,
      userId: createdUserId,
      accountRole: accountRole as never,
      status: 'ACTIVE',
      canManageUsers: role === 'CUSTOMER_ADMIN' || role === 'MANAGER',
      canManageBilling: role === 'CUSTOMER_ADMIN',
      canManageCampaigns: role !== 'AGENT',
      canViewReports: role !== 'AGENT',
      canUseDynamicCallerId: role !== 'AGENT',
    },
  })
}

export const createTeamUser = async (data: {
  name: string
  email: string
  password: string
  role?: TeamRole
  extension?: string
  phone?: string
}, actor?: Actor) => {
  const role = normalizeRole(data.role) || 'AGENT'
  const agent = await AgentService.createAgent({ ...data, role })
  await autoAttachToActorAccount(agent.id, actor, role)
  return agent
}

export const updateTeamUser = async (id: number, data: Record<string, unknown>, actor?: Actor) => {
  await assertTeamUserAccess(actor, id)
  return AgentService.updateAgent(id, data as never)
}

export const deactivateTeamUser = async (id: number, actor?: Actor) => {
  await assertTeamUserAccess(actor, id)
  if (String(actor?.role || '').toUpperCase() === 'SUPERVISOR') {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
    if (target?.role !== 'AGENT') throw new AppError('Supervisor can manage Agent users only.', 403)
  }
  return AgentService.deleteAgent(id, actor?.id)
}

export const updateTeamStatus = async (id: number, status: TeamStatus, actor?: Actor) => {
  await assertTeamUserAccess(actor, id)
  if (String(actor?.role || '').toUpperCase() === 'SUPERVISOR') {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
    if (target?.role !== 'AGENT') throw new AppError('Supervisor can manage Agent users only.', 403)
  }
  return AgentService.updateAgentStatus(id, status)
}

export const resetTeamPassword = async (id: number, password: string, actor?: Actor) => {
  await assertTeamUserAccess(actor, id)
  return AgentService.resetAgentPassword(id, password)
}

export const getTeamStats = async (actor?: Actor) => {
  const visibleIds = await getVisibleTeamUserIds(actor)
  const where = teamWhere({ isActive: true, role: 'AGENT' }, visibleIds)
  const grouped = await prisma.user.groupBy({ by: ['status'], where, _count: { _all: true } })
  const counts = grouped.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all
    return acc
  }, {})

  return {
    total: grouped.reduce((sum, row) => sum + row._count._all, 0),
    online: counts.ONLINE ?? 0,
    ready: counts.READY ?? 0,
    busy: counts.BUSY ?? 0,
    wrapUp: counts.WRAP_UP ?? 0,
    offline: counts.OFFLINE ?? 0,
  }
}
