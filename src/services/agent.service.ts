import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

type CustomerCreatableRole = 'CUSTOMER_ADMIN' | 'MANAGER' | 'SUPERVISOR' | 'AGENT'

const CUSTOMER_USER_ROLES = ['CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT'] as const
const CUSTOMER_CREATABLE_ROLES = new Set<CustomerCreatableRole>(CUSTOMER_USER_ROLES)
const PLATFORM_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])

const normalizeCustomerCreatableRole = (role?: string): CustomerCreatableRole => {
  const next = String(role || 'AGENT').trim().toUpperCase() as CustomerCreatableRole
  if (!CUSTOMER_CREATABLE_ROLES.has(next)) {
    throw new AppError('Use Platform Administration to manage PTDT platform admins. Team users must be CUSTOMER_ADMIN, MANAGER, SUPERVISOR, or AGENT.', 400)
  }
  return next
}

const isPlatformAdminRole = (role?: string | null) => Boolean(role && PLATFORM_ADMIN_ROLES.has(String(role)))

const generateAgentCode = async () => {
  const baseCount = await prisma.user.count()
  for (let offset = 1; offset <= 500; offset += 1) {
    const code = `AGT-${String(baseCount + offset).padStart(3, '0')}`
    const exists = await prisma.user.findUnique({ where: { agentCode: code }, select: { id: true } })
    if (!exists) return code
  }
  return `AGT-${Date.now()}`
}

export const getAllAgents = async (filters: {
  role?: string
  status?: string
  isActive?: boolean
  search?: string
  page?: number
  limit?: number
}) => {
  const {
    role, status, isActive,
    search, page = 1, limit = 20
  } = filters

  const where: Record<string, unknown> = {
    role: role ? normalizeCustomerCreatableRole(role) : { in: [...CUSTOMER_USER_ROLES] },
  }

  if (status) where.status = status
  if (isActive !== undefined) where.isActive = isActive

  if (search) {
    where.OR = [
      { name:      { contains: search, mode: 'insensitive' } },
      { email:     { contains: search, mode: 'insensitive' } },
      { agentCode: { contains: search, mode: 'insensitive' } },
      { extension: { contains: search, mode: 'insensitive' } },
    ]
  }

  const agents = await prisma.user.findMany({
    where,
    select: {
      id: true, agentCode: true, name: true,
      email: true, role: true, extension: true,
      phone: true, status: true, isActive: true,
      createdAt: true,
      _count: { select: { calls: true } }
    },
    orderBy: { createdAt: 'desc' },
    skip:  (page - 1) * limit,
    take:  limit,
  })
  const total = await prisma.user.count({ where })

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

export const getAgentById = async (id: number) => {
  const agent = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, agentCode: true, name: true,
      email: true, role: true, extension: true,
      phone: true, status: true, isActive: true,
      createdAt: true, updatedAt: true,
      _count: { select: { calls: true } },
      calls: {
        take: 10,
        orderBy: { startedAt: 'desc' },
        select: {
          id: true, status: true, duration: true,
          disposition: true, startedAt: true,
          contact: { select: { name: true, phone: true } }
        }
      }
    },
  })
  if (!agent) throw new AppError('Team user not found', 404)
  if (isPlatformAdminRole(agent.role)) {
    throw new AppError('PTDT platform admins are not managed from the Team Users page', 403)
  }
  return agent
}

export const createAgent = async (data: {
  name: string
  email: string
  password: string
  role?: CustomerCreatableRole
  extension?: string
  phone?: string
}) => {
  const normalizedEmail = data.email.trim().toLowerCase()
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  })
  if (existing) throw new AppError('Email already registered', 409)

  const agentCode = await generateAgentCode()
  const hashedPassword = await bcrypt.hash(data.password, 12)
  const role = normalizeCustomerCreatableRole(data.role)
  const extension = data.extension?.trim() || undefined
  const phone = data.phone?.trim() || undefined

  try {
    const agent = await prisma.user.create({
      data: {
        agentCode,
        name:      data.name.trim(),
        email:     normalizedEmail,
        passwordHash: hashedPassword,
        role,
        extension,
        phone,
      },
      select: {
        id: true, agentCode: true, name: true,
        email: true, role: true, extension: true,
        phone: true, status: true, isActive: true,
        createdAt: true,
      },
    })

    return agent
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(', ') : String(err?.meta?.target || 'unique field')
      throw new AppError(`Team user could not be created because ${target} is already in use. Please retry with another email/extension.`, 409)
    }
    throw err
  }
}

export const updateAgent = async (
  id: number,
  data: {
    name?: string
    email?: string
    role?: CustomerCreatableRole
    extension?: string
    phone?: string
    isActive?: boolean
  }
) => {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new AppError('Team user not found', 404)

  if (isPlatformAdminRole(existing.role)) {
    const restrictedPlatformChange = data.role !== undefined || data.isActive !== undefined || data.email !== undefined
    if (restrictedPlatformChange) {
      throw new AppError('PTDT platform admins cannot be changed from the Team Users page', 403)
    }
  }

  if (data.email && data.email !== existing.email) {
    const emailTaken = await prisma.user.findUnique({
      where: { email: data.email }
    })
    if (emailTaken) throw new AppError('Email already in use', 409)
  }

  const updateData = {
    ...data,
    ...(data.role ? { role: normalizeCustomerCreatableRole(data.role) } : {}),
    ...(data.isActive === true ? { status: 'OFFLINE' as const } : {}),
    ...(data.isActive === false ? { status: 'OFFLINE' as const } : {}),
  }

  const agent = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true, agentCode: true, name: true,
      email: true, role: true, extension: true,
      phone: true, status: true, isActive: true,
      updatedAt: true,
    },
  })

  return agent
}

export const deleteAgent = async (id: number, actorId?: number) => {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new AppError('Team user not found', 404)
  if (actorId && actorId === id) throw new AppError('You cannot deactivate your own signed-in account', 400)
  if (isPlatformAdminRole(existing.role)) {
    throw new AppError('PTDT platform admins cannot be deactivated from the Team Users page', 403)
  }

  return prisma.user.update({
    where: { id },
    data: { isActive: false, status: 'OFFLINE' },
    select: {
      id: true, agentCode: true, name: true,
      email: true, role: true, extension: true,
      phone: true, status: true, isActive: true,
      updatedAt: true,
    },
  })
}

export const updateAgentStatus = async (
  id: number,
  status: 'ONLINE' | 'READY' | 'BUSY' | 'WRAP_UP' | 'OFFLINE'
) => {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new AppError('Team user not found', 404)
  if (!existing.isActive) throw new AppError('Inactive users cannot change status', 400)

  return await prisma.user.update({
    where: { id },
    data: { status },
    select: {
      id: true, agentCode: true,
      name: true, status: true,
    },
  })
}

export const resetAgentPassword = async (
  id: number,
  newPassword: string
) => {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new AppError('Team user not found', 404)
  if (isPlatformAdminRole(existing.role)) {
    throw new AppError('PTDT platform admin passwords must be managed through platform security controls', 403)
  }

  const hashed = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id },
    data: { passwordHash: hashed },
  })
}

export const getAgentStats = async () => {
  const where = {
    role: { in: [...CUSTOMER_USER_ROLES] },
    isActive: true,
  }

  const grouped = await prisma.user.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  })

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
