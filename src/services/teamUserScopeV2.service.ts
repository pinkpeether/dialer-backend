import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import * as AgentService from './agent.service'
import * as BaseScope from './teamUserScope.service'

type Actor = { id: number; email?: string; role?: string }
type TeamRole = 'CUSTOMER_ADMIN' | 'MANAGER' | 'SUPERVISOR' | 'AGENT'

const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const TEAM_ROLES: TeamRole[] = ['CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT']
const isPlatform = (actor?: Actor) => Boolean(actor?.role && PLATFORM_ROLES.has(String(actor.role)))
const actorRole = (actor?: Actor) => String(actor?.role || '').trim().toUpperCase()

const normalizeRole = (value?: string): TeamRole => {
  const role = String(value || 'AGENT').trim().toUpperCase() as TeamRole
  if (!TEAM_ROLES.includes(role)) throw new AppError('Invalid team user role', 400)
  return role
}

const accountRoleForTeamRole = (role: TeamRole) => {
  if (role === 'CUSTOMER_ADMIN' || role === 'MANAGER') return 'ADMIN'
  if (role === 'SUPERVISOR') return 'SUPERVISOR'
  return 'AGENT'
}

const permissionsForRole = (role: TeamRole) => ({
  canManageUsers: role === 'CUSTOMER_ADMIN' || role === 'MANAGER',
  canManageBilling: role === 'CUSTOMER_ADMIN',
  canManageCampaigns: role !== 'AGENT',
  canViewReports: role !== 'AGENT',
  canUseDynamicCallerId: role !== 'AGENT',
})

const attachUserToAccount = async (userId: number, accountId: number, role: TeamRole) => {
  return prisma.commercialAccountMembership.upsert({
    where: { accountId_userId: { accountId, userId } },
    update: {
      status: 'ACTIVE',
      accountRole: accountRoleForTeamRole(role) as never,
      ...permissionsForRole(role),
    },
    create: {
      accountId,
      userId,
      accountRole: accountRoleForTeamRole(role) as never,
      status: 'ACTIVE',
      ...permissionsForRole(role),
    },
  })
}

const getManagedAccountId = async (actor?: Actor) => {
  const requireManageUsers = actorRole(actor) !== 'SUPERVISOR'
  const accountIds = await BaseScope.getActorAccountIds(actor, requireManageUsers)
  if (!accountIds.length) {
    throw new AppError('Your account is not allowed to create team users. Ask PTDT Support to assign account membership.', 403)
  }
  return accountIds[0]
}

export const createTeamUser = async (data: {
  name: string
  email: string
  password: string
  role?: TeamRole
  extension?: string
  phone?: string
}, actor?: Actor) => {
  const role = normalizeRole(data.role)

  if (actorRole(actor) === 'SUPERVISOR' && role !== 'AGENT') {
    throw new AppError('Supervisor can create Agent users only.', 403)
  }

  if (isPlatform(actor)) {
    return AgentService.createAgent({ ...data, role })
  }

  const accountId = await getManagedAccountId(actor)
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, role: true, isActive: true },
  })

  if (existing) {
    if (!TEAM_ROLES.includes(String(existing.role) as TeamRole)) {
      throw new AppError('Email is already registered as a platform user and cannot be used as a customer team user.', 409)
    }

    const memberships = await prisma.commercialAccountMembership.findMany({
      where: { userId: existing.id },
      select: { accountId: true },
    })

    if (memberships.some(item => item.accountId === accountId)) {
      throw new AppError('Email already registered in this customer account.', 409)
    }

    if (memberships.length > 0) {
      throw new AppError('Email already registered under another customer account.', 409)
    }

    await attachUserToAccount(existing.id, accountId, role)
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        role,
        extension: data.extension,
        phone: data.phone,
        isActive: true,
        status: 'OFFLINE',
      },
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
      },
    })
  }

  const agent = await AgentService.createAgent({ ...data, role })
  await attachUserToAccount(agent.id, accountId, role)
  return agent
}

export const listTeamUsers = BaseScope.listTeamUsers
export const assertTeamUserAccess = BaseScope.assertTeamUserAccess
export const updateTeamUser = BaseScope.updateTeamUser
export const deactivateTeamUser = BaseScope.deactivateTeamUser
export const updateTeamStatus = BaseScope.updateTeamStatus
export const resetTeamPassword = BaseScope.resetTeamPassword
export const getTeamStats = BaseScope.getTeamStats
