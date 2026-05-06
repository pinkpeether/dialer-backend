import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

export const generateToken = (payload: {
  id: number
  email: string
  role: string
}) => {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
  expiresIn: process.env.JWT_EXPIRES_IN as any || '30d',
})
}

export const registerUser = async (data: {
  name: string
  email: string
  password: string
  role?: 'ADMIN' | 'SUPERVISOR' | 'AGENT'
  extension?: string
  phone?: string
}) => {
  // Check duplicate email
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  })
  if (existing) throw new AppError('Email already registered', 409)

  // Generate agent code
  const count = await prisma.user.count()
  const agentCode = `AGT-${String(count + 1).padStart(3, '0')}`

  // Hash password
  const hashedPassword = await bcrypt.hash(data.password, 12)

  const user = await prisma.user.create({
    data: {
      agentCode,
      name: data.name,
      email: data.email,
      password: hashedPassword,
      role: data.role || 'AGENT',
      extension: data.extension,
      phone: data.phone,
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
      createdAt: true,
    },
  })

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
  })

  return { user, token }
}

export const loginUser = async (email: string, password: string) => {
  // Find user
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new AppError('Invalid email or password', 401)

  // Check active
  if (!user.isActive) throw new AppError('Account is deactivated', 403)

  // Check password
  const isMatch = await bcrypt.compare(password, user.password)
  if (!isMatch) throw new AppError('Invalid email or password', 401)

  // Update status to ONLINE
  await prisma.user.update({
    where: { id: user.id },
    data: { status: 'ONLINE' },
  })

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
  })

  return {
    user: {
      id: user.id,
      agentCode: user.agentCode,
      name: user.name,
      email: user.email,
      role: user.role,
      extension: user.extension,
      phone: user.phone,
      status: 'ONLINE',
    },
    token,
  }
}

export const getProfile = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
  if (!user) throw new AppError('User not found', 404)
  return user
}

export const logoutUser = async (userId: number) => {
  await prisma.user.update({
    where: { id: userId },
    data: { status: 'OFFLINE' },
  })
}

export const seedAdmin = async () => {
  const existing = await prisma.user.findUnique({
    where: { email: process.env.ADMIN_EMAIL! },
  })
  if (existing) return

  const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD!, 12)

  await prisma.user.create({
    data: {
      agentCode: 'AGT-000',
      name: 'Super Admin',
      email: process.env.ADMIN_EMAIL!,
      password: hashedPassword,
      role: 'ADMIN',
      status: 'ONLINE',
    },
  })

  console.log(`✅ Admin seeded: ${process.env.ADMIN_EMAIL}`)
}