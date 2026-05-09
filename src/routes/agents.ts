import { Router } from 'express'
import type { Response, NextFunction } from 'express'
import * as AgentController from '../controllers/agent.controller'
import * as AgentService from '../services/agent.service'
import { authenticate, authorize } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { sendSuccess } from '../utils/response'
import {
  createAgentSchema,
  updateAgentSchema,
  updateStatusSchema,
  resetPasswordSchema,
} from '../validators/agent.validator'

const router = Router()

// Sab routes protected hain
router.use(authenticate)

// Stats — Admin + Supervisor
router.get('/stats',
  authorize('ADMIN', 'SUPERVISOR'),
  AgentController.getAgentStats
)

// Update own status — current logged-in agent/admin/supervisor
// IMPORTANT: keep this before /:id routes.
router.patch('/me/status',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  validate(updateStatusSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id
      const agent = await AgentService.updateAgentStatus(userId, req.body.status)
      return sendSuccess(res, agent, 'Agent status updated')
    } catch (err) {
      return next(err)
    }
  }
)

// List all agents — Admin + Supervisor
router.get('/',
  authorize('ADMIN', 'SUPERVISOR'),
  AgentController.getAllAgents
)

// Single agent — Admin + Supervisor
router.get('/:id',
  authorize('ADMIN', 'SUPERVISOR'),
  AgentController.getAgentById
)

// Create agent — Admin only
router.post('/',
  authorize('ADMIN'),
  validate(createAgentSchema),
  AgentController.createAgent
)

// Update agent — Admin only
router.put('/:id',
  authorize('ADMIN'),
  validate(updateAgentSchema),
  AgentController.updateAgent
)

// Delete agent (soft) — Admin only
router.delete('/:id',
  authorize('ADMIN'),
  AgentController.deleteAgent
)

// Update status — Admin + Supervisor + Agent himself
router.patch('/:id/status',
  validate(updateStatusSchema),
  AgentController.updateAgentStatus
)

// Reset password — Admin only
router.patch('/:id/reset-password',
  authorize('ADMIN'),
  validate(resetPasswordSchema),
  AgentController.resetAgentPassword
)

export default router
