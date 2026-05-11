import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import { initSocket } from './socket/socket.server'
import { authLimiter, apiLimiter } from './middleware/rateLimiter'
import { AppError, errorHandler } from './middleware/errorHandler'

import authRoutes from './routes/auth'
import agentRoutes from './routes/agents'
import campaignRoutes from './routes/campaigns'
import contactRoutes from './routes/contacts'
import dialerRoutes from './routes/dialer'
import callRoutes from './routes/call.routes'

import './services/dialerScheduler'

const app = express()
const httpServer = createServer(app)

app.set('trust proxy', 1)

initSocket(httpServer)

const allowedOrigins = (
  process.env.CORS_ORIGIN ||
  process.env.FRONTEND_URL ||
  'http://localhost:5173'
)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

app.use(helmet({ contentSecurityPolicy: false }))

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server tools, curl, Postman, and Electron packaged app.
    if (!origin || origin === 'null' || origin.startsWith('file://')) {
      callback(null, true)
      return
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new AppError(`CORS blocked origin: ${origin}`, 403))
  },
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'PTDT Dialer API is healthy',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/auth', authLimiter, authRoutes)
app.use('/api', apiLimiter)

app.use('/api/agents', agentRoutes)
app.use('/api/campaigns', campaignRoutes)
app.use('/api/contacts', contactRoutes)
app.use('/api/calls', callRoutes)
app.use('/api/dialer', dialerRoutes)

app.use((_req, _res, next) => {
  next(new AppError('Route not found', 404))
})

app.use(errorHandler)

export { httpServer }
export default app