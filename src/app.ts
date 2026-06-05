import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import { initSocket } from './socket/socket.server'
import { authLimiter, apiLimiter } from './middleware/rateLimiter'
import { AppError, errorHandler } from './middleware/errorHandler'

import authRoutes     from './routes/auth'
import agentRoutes    from './routes/agents'
import campaignRoutes from './routes/campaigns'
import contactRoutes  from './routes/contacts'
import dialerRoutes   from './routes/dialer'
import callRoutes     from './routes/call.routes'
import dncRoutes      from './routes/dnc'
import callbackRoutes from './routes/callbacks'
import reportsRoutes  from './routes/reports'
import auditRoutes    from './routes/audit.routes'
import settingsRoutes from './routes/settings.routes'
import notificationRoutes from './routes/notifications.routes'
import recordingRoutes from './routes/recordings.routes'
import exportRoutes   from './routes/exports.routes'
import opsRoutes      from './routes/ops.routes'
import monitoringRoutes from './routes/monitoring.routes'
import supportDiagnosticsRoutes from './routes/supportDiagnostics.routes'
import spoofingRoutes from './routes/spoofing.routes'
import callIntelligenceRoutes from './routes/callIntelligence.routes'
import advancedDialingRoutes from './routes/advancedDialing.routes'
import campaignManagementProRoutes from './routes/campaignManagementPro.routes'
import agentManagementRoutes from './routes/agentManagement.routes'
import callControlRoutes from './routes/callControl.routes'
import liveAiRoutes from './routes/liveAi.routes'
import liveMonitoringAdvancedRoutes from './routes/liveMonitoringAdvanced.routes'
import campaignManagementProRoutes from './routes/campaignManagementPro.routes'
import { requestMetricsMiddleware } from './middleware/requestMetrics.middleware'

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
app.use(requestMetricsMiddleware)

app.get('/api/health', (_req, res) => {
  res.json({
    success:   true,
    message:   'PTDT Dialer API is healthy',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/auth',      authLimiter, authRoutes)
app.use('/api',           apiLimiter)

app.use('/api/agents',    agentRoutes)
app.use('/api/campaigns', campaignRoutes)
app.use('/api/contacts',  contactRoutes)
app.use('/api/calls',     callRoutes)
app.use('/api/dialer',    dialerRoutes)
app.use('/api/dnc',       dncRoutes)
app.use('/api/callbacks', callbackRoutes)
app.use('/api/reports',   reportsRoutes)
app.use('/api/audit-logs', auditRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/recordings', recordingRoutes)
app.use('/api/exports', exportRoutes)
app.use('/api/ops', opsRoutes)
app.use('/api/monitoring', monitoringRoutes)
app.use('/api/support/diagnostics', supportDiagnosticsRoutes)
app.use('/api/spoofing', spoofingRoutes)
app.use('/api/call-intelligence', callIntelligenceRoutes)
app.use('/api/advanced-dialing', advancedDialingRoutes)
app.use('/api/call-controls', callControlRoutes)
app.use('/api/live-ai', liveAiRoutes)
app.use('/api/agent-management', agentManagementRoutes)
app.use('/api/live-monitoring-advanced', liveMonitoringAdvancedRoutes)
app.use('/api/campaign-management-pro', campaignManagementProRoutes)
app.use('/api/call-controls', callControlRoutes)
app.use('/api/live-ai', liveAiRoutes)
app.use('/api/agent-management', agentManagementRoutes)
app.use('/api/live-monitoring-advanced', liveMonitoringAdvancedRoutes)
app.use('/api/campaign-management-pro', campaignManagementProRoutes)

app.use((_req, _res, next) => {
  next(new AppError('Route not found', 404))
})

app.use(errorHandler)

export { httpServer }
export default app
