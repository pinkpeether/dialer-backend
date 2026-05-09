import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import { initSocket } from './socket/socket.server'
import authRoutes     from './routes/auth'
import agentRoutes    from './routes/agents'
import campaignRoutes from './routes/campaigns'
import contactRoutes  from './routes/contacts'
import dialerRoutes   from './routes/dialer'
import './services/dialerScheduler'

const app = express()
const httpServer = createServer(app)

initSocket(httpServer)

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth',      authRoutes)
app.use('/api/agents',    agentRoutes)
app.use('/api/campaigns', campaignRoutes)
app.use('/api/contacts',  contactRoutes)
app.use('/api/dialer',    dialerRoutes)

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

export { httpServer }
export default app