import { Server as HTTPServer } from 'http'
import { Server as SocketServer, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'
import { getJwtSecret } from '../services/auth.service'

let io: SocketServer

const PLATFORM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN'])
const VALID_USER_STATUSES = new Set(['ONLINE', 'OFFLINE', 'READY', 'BUSY', 'WRAP_UP'])

type SocketUser = {
  id: number
  email: string
  role: string
  name?: string | null
  accountIds: number[]
}

const dashboardAccountRoom = (accountId: number) => `dashboard:account:${accountId}`
const dashboardPlatformRoom = 'dashboard:platform'

export const initSocket = (httpServer: HTTPServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) throw new Error('No token')
      const decoded = jwt.verify(token, getJwtSecret()) as { id?: number }
      if (!decoded.id) throw new Error('Invalid token subject')

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          isActive: true,
          commercialMemberships: {
            where: {
              status: 'ACTIVE',
              account: { status: { not: 'ARCHIVED' } },
            },
            select: { accountId: true },
          },
        },
      })

      if (!user?.isActive) throw new Error('Inactive user')
      ;(socket as any).user = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        accountIds: user.commercialMemberships.map(item => item.accountId),
      } satisfies SocketUser
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as SocketUser
    console.log(`🔌 Socket connected: ${user?.email}`)

    socket.join(`agent:${user?.id}`)
    if (PLATFORM_ROLES.has(String(user.role || '').toUpperCase())) {
      socket.join(dashboardPlatformRoom)
    }
    user.accountIds.forEach(accountId => socket.join(dashboardAccountRoom(accountId)))

    socket.on('agent:status', async (status: string) => {
      try {
        if (!VALID_USER_STATUSES.has(status)) {
          socket.emit('agent:status:error', { message: 'Invalid agent status' })
          return
        }
        const updated = await prisma.user.update({
          where: { id: user.id },
          data: { status: status as any },
          select: {
            id: true,
            name: true,
            status: true,
            commercialMemberships: {
              where: { status: 'ACTIVE' },
              select: { accountId: true },
            },
          },
        })
        const payload = {
          agentId: updated.id,
          status: updated.status,
          name: updated.name,
        }
        emitToAgent(updated.id, 'agent:statusChanged', payload)
        updated.commercialMemberships.forEach(member => {
          emitToDashboard('agent:statusChanged', payload, member.accountId)
        })
      } catch (err) {
        socket.emit('agent:status:error', {
          message: err instanceof Error ? err.message : 'Unable to update agent status',
        })
      }
    })

    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${user?.email}`)
    })
  })

  return io
}

export const getIO = (): SocketServer => {
  if (!io) throw new Error('Socket not initialized')
  return io
}

export const emitToAgent = (agentId: number, event: string, data: unknown) => {
  getIO().to(`agent:${agentId}`).emit(event, data)
}

export const emitToDashboard = (event: string, data: unknown, accountId?: number | null) => {
  const server = getIO()
  server.to(dashboardPlatformRoom).emit(event, data)
  if (typeof accountId === 'number') {
    server.to(dashboardAccountRoom(accountId)).emit(event, data)
  }
}
