import { Server as HTTPServer } from 'http'
import { Server as SocketServer, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'

let io: SocketServer

export const initSocket = (httpServer: HTTPServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) throw new Error('No token')
      const user = jwt.verify(token, process.env.JWT_SECRET || 'secret') as Record<string, unknown>
      ;(socket as any).user = user
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user
    console.log(`🔌 Socket connected: ${user?.email}`)

    socket.join(`agent:${user?.id}`)
    socket.join('dashboard')

    socket.on('agent:status', async (status: string) => {
      const { prisma } = await import('../lib/prisma')
      await prisma.user.update({
      where: { id: user.id },
      data:  { status: status as any },
    })
      io.to('dashboard').emit('agent:statusChanged', {
        agentId: user.id,
        status,
        name: user.name,
      })
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

export const emitToDashboard = (event: string, data: unknown) => {
  getIO().to('dashboard').emit(event, data)
}
