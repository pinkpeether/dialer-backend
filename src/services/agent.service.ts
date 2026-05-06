import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

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

  const where: Record<string, unknown> = {}

  if (role)     where.role     = role
  if (status)   where.status   = status
  if (isActive !== undefined) where.isActive = isActive

  if (search) {
    where.OR = [
      { name:      { contains: search, mode: 'insensitive' } },
      { email:     { contains: search, mode: 'insensitive' } },
      { agentCode: { contains: search, mode: 'insensitive' } },
      { extension: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [agents, total] = await Promise.all([
    prisma.user.findMany({
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
  if (!agent) throw new AppError('Agent not found', 404)
  return agent
}

export const createAgent = async (data: {
  name: string
  email: string
  password: string
  role?: 'ADMIN' | 'SUPERVISOR' | 'AGENT'
  extension?: string
  phone?: string
}) => {
  // Check duplicate email
  const existing = await prisma.user.findUnique({
    where: { email: data.email }
  })
  if (existing) throw new AppError('Email already registered', 409)

  // Auto-generate agent code
  const count = await prisma.user.count()
  const agentCode = `AGT-${String(count + 1).padStart(3, '0')}`

  const hashedPassword = await bcrypt.hash(data.password, 12)

  const agent = await prisma.user.create({
    data: {
      agentCode,
      name:      data.name,
      email:     data.email,
      password:  hashedPassword,
      role:      data.role || 'AGENT',
      extension: data.extension,
      phone:     data.phone,
    },
    select: {
      id: true, agentCode: true, name: true,
      email: true, role: true, extension: true,
      phone: true, status: true, isActive: true,
      createdAt: true,
    },
  })

  return agent
}

export const updateAgent = async (
  id: number,
  data: {
    name?: string
    email?: string
    role?: 'ADMIN' | 'SUPERVISOR' | 'AGENT'
    extension?: string
    phone?: string
    isActive?: boolean
  }
) => {
  // Check agent exists
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new AppError('Agent not found', 404)

  // Check email duplicate if email is being changed
  if (data.email && data.email !== existing.email) {
    const emailTaken = await prisma.user.findUnique({
      where: { email: data.email }
    })
    if (emailTaken) throw new AppError('Email already in use', 409)
  }

  const agent = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, agentCode: true, name: true,
      email: true, role: true, extension: true,
      phone: true, status: true, isActive: true,
      updatedAt: true,
    },
  })

  return agent
}

export const deleteAgent = async (id: number) => {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new AppError('Agent not found', 404)

  // Soft delete — isActive = false
  await prisma.user.update({
    where: { id },
    data: { isActive: false, status: 'OFFLINE' },
  })
}

export const updateAgentStatus = async (
  id: number,
  status: 'ONLINE' | 'READY' | 'BUSY' | 'WRAP_UP' | 'OFFLINE'
) => {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw new AppError('Agent not found', 404)

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
  if (!existing) throw new AppError('Agent not found', 404)

  const hashed = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id },
    data: { password: hashed },
  })
}

export const getAgentStats = async () => {
  const [total, online, ready, busy, wrapUp, offline] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ONLINE'   } }),
    prisma.user.count({ where: { status: 'READY'    } }),
    prisma.user.count({ where: { status: 'BUSY'     } }),
    prisma.user.count({ where: { status: 'WRAP_UP'  } }),
    prisma.user.count({ where: { status: 'OFFLINE'  } }),
  ])

  return { total, online, ready, busy, wrapUp, offline }
}