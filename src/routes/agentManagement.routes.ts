import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as AgentManagementController from '../controllers/agentManagement.controller'

const router = Router()

router.use(authenticate)

router.get('/overview',
  authorize('ADMIN', 'SUPERVISOR'),
  AgentManagementController.overview,
)

router.get('/leaderboard',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  AgentManagementController.leaderboard,
)

router.get('/performance',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  AgentManagementController.performance,
)

router.get('/shifts',
  authorize('ADMIN', 'SUPERVISOR'),
  AgentManagementController.shifts,
)

router.put('/shifts/:agentId',
  authorize('ADMIN', 'SUPERVISOR'),
  AgentManagementController.updateShift,
)

router.get('/break-reminders',
  authorize('ADMIN', 'SUPERVISOR'),
  AgentManagementController.breakReminders,
)

router.post('/sessions/start',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  AgentManagementController.startSession,
)

router.post('/sessions/end',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  AgentManagementController.endSession,
)

router.get('/sessions',
  authorize('ADMIN', 'SUPERVISOR'),
  AgentManagementController.sessions,
)

router.delete('/sessions/:agentId',
  authorize('ADMIN', 'SUPERVISOR'),
  AgentManagementController.forceEndSession,
)

export default router
