import { Router } from 'express'
import type { Response, NextFunction } from 'express'
import * as AgentService from '../services/agent.service'
import * as TeamUserScope from '../services/teamUserScopeV2.service'
import { listTeamUsersWithAccounts } from '../services/teamUserAccountList.service'
import { permanentlyRemoveTeamUser } from '../services/teamUserMaintenance.service'
import { authenticate, authorize, authorizePlatformAdmin } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { sendSuccess } from '../utils/response'
import { createAgentSchema, updateAgentSchema, updateStatusSchema } from '../validators/agent.validator'

const router = Router()
router.use(authenticate)

const viewerRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR']
const managerRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER']
const creatorRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR']
const selfRoles = ['ADMIN', 'CUSTOMER_ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT']

router.get('/stats', authorize(...viewerRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { return sendSuccess(res, await TeamUserScope.getTeamStats(req.user), 'Team user stats fetched') }
  catch (err) { return next(err) }
})

router.post('/:id/final-remove', authorizePlatformAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { return sendSuccess(res, await permanentlyRemoveTeamUser(req.params.id, req.user), 'Team user permanently removed') }
  catch (err) { return next(err) }
})

router.patch('/me/status', authorize(...selfRoles), validate(updateStatusSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { return sendSuccess(res, await AgentService.updateAgentStatus(req.user!.id, req.body.status), 'Team user status updated') }
  catch (err) { return next(err) }
})

router.patch('/me', authorize(...selfRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, phone, extension } = req.body
    const data: { name?: string; phone?: string; extension?: string } = {}
    if (typeof name === 'string' && name.trim()) data.name = name.trim()
    if (typeof phone === 'string') data.phone = phone.trim() || undefined
    if (typeof extension === 'string') data.extension = extension.trim() || undefined
    return sendSuccess(res, await AgentService.updateAgent(req.user!.id, data), 'Profile updated')
  } catch (err) { return next(err) }
})

router.get('/', authorize(...viewerRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role, status, search, page, limit, isActive } = req.query
    const result = await listTeamUsersWithAccounts({ role: role as string, status: status as string, search: search as string, isActive: isActive !== undefined ? isActive === 'true' : undefined, page: page ? Number(page) : 1, limit: limit ? Number(limit) : 20 }, req.user)
    return sendSuccess(res, result, 'Team users fetched')
  } catch (err) { return next(err) }
})

router.get('/:id', authorize(...viewerRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id)
    await TeamUserScope.assertTeamUserAccess(req.user, id)
    return sendSuccess(res, await AgentService.getAgentById(id), 'Team user fetched')
  } catch (err) { return next(err) }
})

router.post('/', authorize(...creatorRoles), validate(createAgentSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { return sendSuccess(res, await TeamUserScope.createTeamUser(req.body, req.user), 'Team user created successfully', 201) }
  catch (err) { return next(err) }
})

router.put('/:id', authorize(...managerRoles), validate(updateAgentSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { return sendSuccess(res, await TeamUserScope.updateTeamUser(Number(req.params.id), req.body, req.user), 'Team user updated successfully') }
  catch (err) { return next(err) }
})

router.delete('/:id', authorize(...managerRoles), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { return sendSuccess(res, await TeamUserScope.deactivateTeamUser(Number(req.params.id), req.user), 'Team user deactivated successfully') }
  catch (err) { return next(err) }
})

router.patch('/:id/status', authorize(...viewerRoles), validate(updateStatusSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { return sendSuccess(res, await TeamUserScope.updateTeamStatus(Number(req.params.id), req.body.status, req.user), 'Team user status updated') }
  catch (err) { return next(err) }
})

export default router
