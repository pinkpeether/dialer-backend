import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

type Actor = { id: number; email?: string; role?: string }

const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const CUSTOMER_ASSIGNABLE_ROLES = ['CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT'] as const

const isPlatformAdmin = (actor?: Actor) => Boolean(actor?.role && PLATFORM_ROLES.has(String(actor.role)))

const parseId = (raw: string | number) => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid account id', 400)
  return id
}

export const listAssignableUsersForAccount = async (accountIdRaw: string | number, actor?: Actor) => {
  if (!isPlatformAdmin(actor)) throw new AppError('PTDT platform admin access required', 403)
  const accountId = parseId(accountIdRaw)

  const account = await prisma.commercialAccount.findUnique({ where: { id: accountId }, select: { id: true } })
  if (!account) throw new AppError('Commercial account not found', 404)

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [...CUSTOMER_ASSIGNABLE_ROLES] },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      extension: true,
      agentCode: true,
      commercialMemberships: { select: { accountId: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  return users
    .filter(user => user.commercialMemberships.length === 0 || user.commercialMemberships.some(member => member.accountId === accountId))
    .map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      extension: user.extension,
      agentCode: user.agentCode,
      accountIds: user.commercialMemberships.map(member => member.accountId),
      isUnassigned: user.commercialMemberships.length === 0,
      isSelectedAccountMember: user.commercialMemberships.some(member => member.accountId === accountId),
    }))
}
