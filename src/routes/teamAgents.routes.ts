import { Router } from 'express'
import type { Response, NextFunction } from 'express'
import * as AgentService from '../services/agent.service'
import * as TeamUserScope from '../services/teamUserScopeV2.service'
import { authenticate, authorize } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { sendSuccess } from '../utils/response'
import { createAgentSchema, updateAgentSchema, updateStatusSchema } from '../validators/agent.validator'

const router = Router()
router.use(authenticate)

const viewerRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR']
const managerRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER']
const selfRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT']

router.get('/stats', authorize(...viewerRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await TeamUserScope.getTeamStats(req.user)
    return sendSuccess(res, stats, 'Team user stats fetched')
  } catch (err) { return next(err) }
})

router.patch('/me/status', authorize(...selfRoles), validate(updateStatusSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentService.updateAgentStatus(req.user!.id, req.body.status)
    return sendSuccess(res, result, 'Team user status updated')
  } catch (err) { return next(err) }
})

router.patch('/me', authorize(...selfRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, phone, extension } = req.body
    const data: { name?: string; phone?: string; extension?: string } = {}
    if (typeof name === 'string' && name.trim()) data.name = name.trim()
    if (typeof phone === 'string') data.phone = phone.trim() || undefined
    if (typeof extension === 'string') data.extension = extension.trim() || undefined
    const result = await AgentService.updateAgent(req.user!.id, data)
    return sendSuccess(res, result, 'Profile updated')
  } catch (err) { return next(err) }
})

router.get('/', authorize(...viewerRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role, status, search, page, limit, isActive } = req.query
    const result = await TeamUserScope.listTeamUsers({
      role: role as string,
      status: status as string,
      search: search as string,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    }, req.user)
    return sendSuccess(res, result, 'Team users fetched')
  } catch (err) { return next(err) }
})

router.get('/:id', authorize(...viewerRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id)
    await TeamUserScope.assertTeamUserAccess(req.user, id)
    const result = await AgentService.getAgentById(id)
    return sendSuccess(res, result, 'Team user fetched')
  } catch (err) { return next(err) }
})

router.post('/', authorize(...managerRoles), validate(createAgentSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await TeamUserScope.createTeamUser(req.body, req.user)
    return sendSuccess(res, result, 'Team user created successfully', 201)
  } catch (err) { return next(err) }
})

router.put('/:id', authorize(...managerRoles), validate(updateAgentSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await TeamUserScope.updateTeamUser(Number(req.params.id), req.body, req.user)
    return sendSuccess(res, result, 'Team user updated successfully')
  } catch (err) { return next(err) }
})

router.delete('/:id', authorize(...managerRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await TeamUserScope.deactivateTeamUser(Number(req.params.id), req.user)
    return sendSuccess(res, result, 'Team user deactivated successfully')
  } catch (err) { return next(err) }
})

router.patch('/:id/status', authorize(...viewerRoles), validate(updateStatusSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await TeamUserScope.updateTeamStatus(Number(req.params.id), req.body.status, req.user)
    return sendSuccess(res, result, 'Team user status updated')
  } catch (err) { return next(err) }
})

export default router
