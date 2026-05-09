import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { initSocket } from './socket/socket.server'
import { errorHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'
import agentRoutes from './routes/agents'
import campaignRoutes from './routes/campaigns'
import contactRoutes from './routes/contacts'
import dialerRoutes from './routes/dialer'
import callRoutes from './routes/call.routes'
import './services/dialerScheduler'

const app = express()
const httpServer = createServer(app)

initSocket(httpServer)

const corsOrigins = process.env.CORS_ORIGIN
  ?.split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: corsOrigins && corsOrigins.length > 0
    ? corsOrigins
    : process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authLimiter, authRoutes)
app.use('/api', apiLimiter)
app.use('/api/agents', agentRoutes)
app.use('/api/campaigns', campaignRoutes)
app.use('/api/contacts', contactRoutes)
app.use('/api/dialer', dialerRoutes)
app.use('/api/calls', callRoutes)

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

app.use(errorHandler)

export { httpServer }
export default app
