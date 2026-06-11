import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'

type Actor = {
  id: number
  email?: string
  role?: string
}

type AccountRole = 'OWNER' | 'ADMIN' | 'BILLING' | 'SUPERVISOR' | 'AGENT'
type MembershipStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'

export type AddAccountMemberInput = {
  userId: number | string
  accountRole: AccountRole
  status?: MembershipStatus
  canManageUsers?: boolean
  canManageBilling?: boolean
  canManageCampaigns?: boolean
  canViewReports?: boolean
  canUseDynamicCallerId?: boolean
  notes?: string | null
}

export type UpdateAccountMemberInput = Partial<Omit<AddAccountMemberInput, 'userId'>>

const PLATFORM_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const ACCOUNT_ROLES = new Set<AccountRole>(['OWNER', 'ADMIN', 'BILLING', 'SUPERVISOR', 'AGENT'])
const MEMBERSHIP_STATUSES = new Set<MembershipStatus>(['ACTIVE', 'INACTIVE', 'SUSPENDED'])

const parseId = (value: number | string, label = 'id') => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new AppError(`Invalid ${label}`, 400)
  return id
}

const isPlatformAdmin = (actor?: Actor | null) => Boolean(actor?.role && PLATFORM_ADMIN_ROLES.has(actor.role))

const audit = async (
  actor: Actor | undefined,
  action: string,
  entity: string,
  entityId: number | string | null,
  metadata?: Record<string, unknown>,
) => {
  await logAuditEvent({
    actor,
    action,
    entity,
    entityId: entityId === null ? undefined : String(entityId),
    metadata,
  })
}

const normalizeAccountRole = (value: unknown): AccountRole => {
  const role = String(value || '').trim().toUpperCase() as AccountRole
  if (!ACCOUNT_ROLES.has(role)) throw new AppError('Invalid account role', 400)
  return role
}

const normalizeStatus = (value: unknown, fallback: MembershipStatus = 'ACTIVE'): MembershipStatus => {
  const status = String(value || fallback).trim().toUpperCase() as MembershipStatus
  if (!MEMBERSHIP_STATUSES.has(status)) throw new AppError('Invalid membership status', 400)
  return status
}

const defaultPermissionsForRole = (role: AccountRole) => {
  if (role === 'OWNER') {
    return {
      canManageUsers: true,
      canManageBilling: true,
      canManageCampaigns: true,
      canViewReports: true,
      canUseDynamicCallerId: true,
    }
  }
  if (role === 'ADMIN') {
    return {
      canManageUsers: true,
      canManageBilling: false,
      canManageCampaigns: true,
      canViewReports: true,
      canUseDynamicCallerId: true,
    }
  }
  if (role === 'BILLING') {
    return {
      canManageUsers: false,
      canManageBilling: true,
      canManageCampaigns: false,
      canViewReports: true,
      canUseDynamicCallerId: false,
    }
  }
  if (role === 'SUPERVISOR') {
    return {
      canManageUsers: false,
      canManageBilling: false,
      canManageCampaigns: true,
      canViewReports: true,
      canUseDynamicCallerId: true,
    }
  }
  return {
    canManageUsers: false,
    canManageBilling: false,
    canManageCampaigns: false,
    canViewReports: false,
    canUseDynamicCallerId: false,
  }
}

async function requireAccountExists(accountId: number) {
  const account = await prisma.commercialAccount.findUnique({
    where: { id: accountId },
    include: {
      wallet: true,
      subscriptions: { include: { plan: true }, orderBy: { startsAt: 'desc' }, take: 1 },
      addons: { include: { addon: true }, orderBy: { id: 'asc' } },
    },
  })
  if (!account) throw new AppError('Commercial account not found', 404)
  return account
}

async function requireUserExists(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  })
  if (!user) throw new AppError('User not found', 404)
  if (!user.isActive) throw new AppError('Cannot assign inactive user to account', 400)
  return user
}

async function requirePlatformAdmin(actor?: Actor) {
  if (!isPlatformAdmin(actor)) {
    throw new AppError('PTDT platform admin access required', 403)
  }
}

async function getActiveMembership(userId: number, accountId: number) {
  return prisma.commercialAccountMembership.findFirst({
    where: { userId, accountId, status: 'ACTIVE' },
    include: { account: true, user: { select: { id: true, name: true, email: true, role: true } } },
  })
}

async function requireAccountAccess(actor: Actor | undefined, accountId: number, permission?: 'canManageUsers' | 'canManageBilling' | 'canManageCampaigns' | 'canViewReports') {
  if (isPlatformAdmin(actor)) return { platform: true, membership: null }
  if (!actor?.id) throw new AppError('Unauthorized', 401)

  const membership = await getActiveMembership(actor.id, accountId)
  if (!membership) throw new AppError('Account access denied', 403)

  if (permission && !membership[permission]) {
    throw new AppError('Account permission denied', 403)
  }

  return { platform: false, membership }
}

function membershipInclude() {
  return {
    user: { select: { id: true, name: true, email: true, role: true, status: true, isActive: true, extension: true, agentCode: true } },
    account: { select: { id: true, name: true, code: true, status: true, currency: true } },
  }
}

export const administrationService = {
  async getMyAdministration(actor?: Actor) {
    if (!actor?.id) throw new AppError('Unauthorized', 401)

    const [user, memberships] = await Promise.all([
      prisma.user.findUnique({
        where: { id: actor.id },
        select: { id: true, name: true, email: true, role: true, status: true, isActive: true, extension: true, agentCode: true },
      }),
      prisma.commercialAccountMembership.findMany({
        where: { userId: actor.id },
        include: {
          account: {
            include: {
              wallet: true,
              subscriptions: { include: { plan: true }, orderBy: { startsAt: 'desc' }, take: 1 },
              addons: { include: { addon: true }, orderBy: { id: 'asc' } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    if (!user) throw new AppError('User not found', 404)

    return {
      user,
      platformAccess: isPlatformAdmin(actor),
      recommendedDashboard: isPlatformAdmin(actor)
        ? '/platform/administration'
        : memberships.some(item => item.canManageBilling)
          ? '/billing'
          : user.role === 'AGENT'
            ? '/agent/workspace'
            : '/dashboard',
      memberships,
      capabilities: {
        canAccessPlatformAdministration: isPlatformAdmin(actor),
        canViewBilling: isPlatformAdmin(actor) || memberships.some(item => item.canManageBilling || item.accountRole === 'OWNER'),
        canManageUsers: isPlatformAdmin(actor) || memberships.some(item => item.canManageUsers),
        canManageCampaigns: isPlatformAdmin(actor) || memberships.some(item => item.canManageCampaigns),
        canUseDynamicCallerId: isPlatformAdmin(actor) || memberships.some(item => item.canUseDynamicCallerId),
      },
    }
  },

  async getPlatformOverview(actor?: Actor) {
    await requirePlatformAdmin(actor)

    const [accounts, users, memberships] = await Promise.all([
      prisma.commercialAccount.findMany({
        include: {
          wallet: true,
          subscriptions: { include: { plan: true }, orderBy: { startsAt: 'desc' }, take: 1 },
          addons: { include: { addon: true }, orderBy: { id: 'asc' } },
          memberships: { include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true } } }, orderBy: { createdAt: 'desc' }, take: 8 },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, isActive: true, extension: true, agentCode: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.commercialAccountMembership.count(),
    ])

    return {
      accounts,
      users,
      stats: {
        accounts: accounts.length,
        users: users.length,
        memberships,
        activeAccounts: accounts.filter(item => item.status === 'ACTIVE').length,
        platformAdmins: users.filter(item => ['SUPER_ADMIN', 'ADMIN'].includes(item.role)).length,
        customerAdmins: users.filter(item => ['CUSTOMER_ADMIN', 'MANAGER'].includes(item.role)).length,
      },
    }
  },

  async listAccountMembers(accountIdRaw: number | string, actor?: Actor) {
    const accountId = parseId(accountIdRaw, 'account id')
    await requireAccountExists(accountId)
    await requireAccountAccess(actor, accountId, 'canManageUsers')

    return prisma.commercialAccountMembership.findMany({
      where: { accountId },
      include: membershipInclude(),
      orderBy: [{ accountRole: 'asc' }, { createdAt: 'desc' }],
    })
  },

  async addAccountMember(accountIdRaw: number | string, input: AddAccountMemberInput, actor?: Actor) {
    const accountId = parseId(accountIdRaw, 'account id')
    const userId = parseId(input.userId, 'user id')
    const accountRole = normalizeAccountRole(input.accountRole)
    const status = normalizeStatus(input.status, 'ACTIVE')
    const defaults = defaultPermissionsForRole(accountRole)

    await requireAccountExists(accountId)
    const user = await requireUserExists(userId)
    await requireAccountAccess(actor, accountId, 'canManageUsers')

    const membership = await prisma.commercialAccountMembership.upsert({
      where: { accountId_userId: { accountId, userId } },
      update: {
        accountRole,
        status,
        canManageUsers: input.canManageUsers ?? defaults.canManageUsers,
        canManageBilling: input.canManageBilling ?? defaults.canManageBilling,
        canManageCampaigns: input.canManageCampaigns ?? defaults.canManageCampaigns,
        canViewReports: input.canViewReports ?? defaults.canViewReports,
        canUseDynamicCallerId: input.canUseDynamicCallerId ?? defaults.canUseDynamicCallerId,
        notes: input.notes === undefined ? undefined : input.notes,
      },
      create: {
        accountId,
        userId,
        accountRole,
        status,
        canManageUsers: input.canManageUsers ?? defaults.canManageUsers,
        canManageBilling: input.canManageBilling ?? defaults.canManageBilling,
        canManageCampaigns: input.canManageCampaigns ?? defaults.canManageCampaigns,
        canViewReports: input.canViewReports ?? defaults.canViewReports,
        canUseDynamicCallerId: input.canUseDynamicCallerId ?? defaults.canUseDynamicCallerId,
        notes: input.notes || null,
        createdByUserId: actor?.id || null,
      },
      include: membershipInclude(),
    })

    await audit(actor, 'ADMIN_ACCOUNT_MEMBER_ASSIGNED', 'CommercialAccountMembership', membership.id, {
      accountId,
      userId,
      userEmail: user.email,
      accountRole,
      status,
    })

    return membership
  },

  async updateAccountMember(membershipIdRaw: number | string, input: UpdateAccountMemberInput, actor?: Actor) {
    const membershipId = parseId(membershipIdRaw, 'membership id')
    const existing = await prisma.commercialAccountMembership.findUnique({ where: { id: membershipId } })
    if (!existing) throw new AppError('Account membership not found', 404)

    await requireAccountAccess(actor, existing.accountId, 'canManageUsers')

    const nextRole = input.accountRole ? normalizeAccountRole(input.accountRole) : existing.accountRole as AccountRole
    const nextStatus = input.status ? normalizeStatus(input.status) : existing.status as MembershipStatus
    const defaults = defaultPermissionsForRole(nextRole)

    const updated = await prisma.commercialAccountMembership.update({
      where: { id: membershipId },
      data: {
        accountRole: nextRole,
        status: nextStatus,
        canManageUsers: input.canManageUsers ?? existing.canManageUsers ?? defaults.canManageUsers,
        canManageBilling: input.canManageBilling ?? existing.canManageBilling ?? defaults.canManageBilling,
        canManageCampaigns: input.canManageCampaigns ?? existing.canManageCampaigns ?? defaults.canManageCampaigns,
        canViewReports: input.canViewReports ?? existing.canViewReports ?? defaults.canViewReports,
        canUseDynamicCallerId: input.canUseDynamicCallerId ?? existing.canUseDynamicCallerId ?? defaults.canUseDynamicCallerId,
        notes: input.notes === undefined ? existing.notes : input.notes,
      },
      include: membershipInclude(),
    })

    await audit(actor, 'ADMIN_ACCOUNT_MEMBER_UPDATED', 'CommercialAccountMembership', membershipId, {
      accountId: existing.accountId,
      userId: existing.userId,
      changes: input,
    })

    return updated
  },

  async suspendAccountMember(membershipIdRaw: number | string, actor?: Actor) {
    return this.updateAccountMember(membershipIdRaw, { status: 'SUSPENDED' }, actor)
  },

  async removeAccountMember(membershipIdRaw: number | string, actor?: Actor) {
    const membershipId = parseId(membershipIdRaw, 'membership id')
    const existing = await prisma.commercialAccountMembership.findUnique({ where: { id: membershipId } })
    if (!existing) throw new AppError('Account membership not found', 404)

    await requireAccountAccess(actor, existing.accountId, 'canManageUsers')

    await prisma.commercialAccountMembership.delete({ where: { id: membershipId } })
    await audit(actor, 'ADMIN_ACCOUNT_MEMBER_REMOVED', 'CommercialAccountMembership', membershipId, {
      accountId: existing.accountId,
      userId: existing.userId,
    })

    return { deleted: true }
  },
}
