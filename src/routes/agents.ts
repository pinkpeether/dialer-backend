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

router.use(authenticate)

// Stats — platform/customer operations roles
router.get('/stats',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR'),
  AgentController.getAgentStats
)

// PATCH /agents/me/status — any authenticated user updates their own status
// IMPORTANT: keep /me routes before /:id routes.
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

// PATCH /agents/me — any authenticated user updates their own profile (name, phone, extension)
router.patch('/me',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id
      const { name, phone, extension } = req.body

      // Whitelist: agents can only update name/phone/extension — not role/isActive
      const allowedData: { name?: string; phone?: string; extension?: string } = {}
      if (typeof name      === 'string' && name.trim())      allowedData.name      = name.trim()
      if (typeof phone     === 'string')                     allowedData.phone     = phone.trim() || undefined
      if (typeof extension === 'string')                     allowedData.extension = extension.trim() || undefined

      const agent = await AgentService.updateAgent(userId, allowedData)
      return sendSuccess(res, agent, 'Profile updated')
    } catch (err) {
      return next(err)
    }
  }
)

// List all agents — Admin + Supervisor
router.get('/',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR'),
  AgentController.getAllAgents
)

// Single agent — Admin + Supervisor
router.get('/:id',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR'),
  AgentController.getAgentById
)

// Create customer-side user — platform admin or customer admin/manager only.
router.post('/',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER'),
  validate(createAgentSchema),
  AgentController.createAgent
)

// Update customer-side user — platform admin or customer admin/manager only.
router.put('/:id',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER'),
  validate(updateAgentSchema),
  AgentController.updateAgent
)

// Deactivate user (soft delete) — platform admin or customer admin/manager only.
router.delete('/:id',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER'),
  AgentController.deleteAgent
)

// Update status for specific agent — Admin + Supervisor
router.patch('/:id/status',
  validate(updateStatusSchema),
  AgentController.updateAgentStatus
)

// Reset password — platform admin or customer admin/manager only.
router.patch('/:id/reset-password',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'MANAGER'),
  validate(resetPasswordSchema),
  AgentController.resetAgentPassword
)

export default router
