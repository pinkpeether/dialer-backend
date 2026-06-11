import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const CUSTOMER_ROLES = new Set(['CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT'])

type Actor = { id: number; email?: string; role?: string }

const requirePlatformAdmin = (actor?: Actor) => {
  if (!actor?.role || !PLATFORM_ROLES.has(String(actor.role))) {
    throw new AppError('PTDT platform admin access required', 403)
  }
}

const parseId = (raw: string | number) => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid user id', 400)
  return id
}

export const permanentlyRemoveTeamUser = async (userIdRaw: string | number, actor?: Actor) => {
  requirePlatformAdmin(actor)
  const userId = parseId(userIdRaw)

  if (actor?.id === userId) throw new AppError('You cannot remove your own signed-in account', 400)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      _count: {
        select: {
          calls: true,
          sessions: true,
          callbacks: true,
          dncEntries: true,
          spoofingNumbers: true,
        },
      },
    },
  })

  if (!user) throw new AppError('Team user not found', 404)
  if (!CUSTOMER_ROLES.has(String(user.role))) {
    throw new AppError('Only customer-side team users can be permanently removed from Team Users', 400)
  }

  const blockers = [
    user._count.calls ? `${user._count.calls} calls` : '',
    user._count.sessions ? `${user._count.sessions} sessions` : '',
    user._count.callbacks ? `${user._count.callbacks} callbacks` : '',
    user._count.dncEntries ? `${user._count.dncEntries} DNC entries` : '',
    user._count.spoofingNumbers ? `${user._count.spoofingNumbers} caller IDs` : '',
  ].filter(Boolean)

  if (blockers.length) {
    throw new AppError(`This user has linked production records (${blockers.join(', ')}). Deactivate instead of permanently removing.`, 409)
  }

  await prisma.$transaction([
    prisma.commercialAccountMembership.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ])

  return { removed: true, id: user.id, name: user.name, email: user.email }
}
