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

const viewerRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR']
const managerRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR']
const selfRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT']

router.get('/stats', authorize(...viewerRoles), AgentController.getAgentStats)

router.patch('/me/status',
  authorize(...selfRoles),
  validate(updateStatusSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id
      const agent = await AgentService.updateAgentStatus(userId, req.body.status)
      return sendSuccess(res, agent, 'Team user status updated')
    } catch (err) {
      return next(err)
    }
  }
)

router.patch('/me',
  authorize(...selfRoles),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id
      const { name, phone, extension } = req.body
      const allowedData: { name?: string; phone?: string; extension?: string } = {}
      if (typeof name === 'string' && name.trim()) allowedData.name = name.trim()
      if (typeof phone === 'string') allowedData.phone = phone.trim() || undefined
      if (typeof extension === 'string') allowedData.extension = extension.trim() || undefined
      const agent = await AgentService.updateAgent(userId, allowedData)
      return sendSuccess(res, agent, 'Profile updated')
    } catch (err) {
      return next(err)
    }
  }
)

router.get('/', authorize(...viewerRoles), AgentController.getAllAgents)
router.get('/:id', authorize(...viewerRoles), AgentController.getAgentById)
router.post('/', authorize(...managerRoles), validate(createAgentSchema), AgentController.createAgent)
router.put('/:id', authorize(...managerRoles), validate(updateAgentSchema), AgentController.updateAgent)
router.delete('/:id', authorize(...managerRoles), AgentController.deleteAgent)
router.patch('/:id/status', authorize(...viewerRoles), validate(updateStatusSchema), AgentController.updateAgentStatus)
router.patch('/:id/reset-password', authorize(...managerRoles), validate(resetPasswordSchema), AgentController.resetAgentPassword)

export default router
