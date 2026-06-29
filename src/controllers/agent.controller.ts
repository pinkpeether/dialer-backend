import { Response, NextFunction } from 'express'
import * as AgentService from '../services/agent.service'
import * as TeamScope from '../services/teamUserScope.service'
import { sendSuccess } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

export const getAllAgents = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const {
      role, status, search,
      page, limit, isActive
    } = req.query

    const result = await TeamScope.listTeamUsers({
      role:     role as string,
      status:   status as string,
      search:   search as string,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page:     page  ? Number(page)  : 1,
      limit:    limit ? Number(limit) : 20,
    }, req.user)

    return sendSuccess(res, result, 'Team users fetched')
  } catch (err) { return next(err) }
}

export const getAgentById = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const id = Number(req.params.id)
    await TeamScope.assertTeamUserAccess(req.user, id)
    const agent = await AgentService.getAgentById(id)
    return sendSuccess(res, agent, 'Team user fetched')
  } catch (err) { return next(err) }
}

export const createAgent = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const agent = await TeamScope.createTeamUser(req.body, req.user)
    return sendSuccess(res, agent, 'Team user created successfully', 201)
  } catch (err) { return next(err) }
}

export const updateAgent = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const agent = await TeamScope.updateTeamUser(Number(req.params.id), req.body, req.user)
    return sendSuccess(res, agent, 'Team user updated successfully')
  } catch (err) { return next(err) }
}

export const deleteAgent = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const agent = await TeamScope.deactivateTeamUser(Number(req.params.id), req.user)
    return sendSuccess(res, agent, 'Team user deactivated successfully')
  } catch (err) { return next(err) }
}

export const updateAgentStatus = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const agent = await TeamScope.updateTeamStatus(
      Number(req.params.id),
      req.body.status,
      req.user
    )
    return sendSuccess(res, agent, 'Team user status updated')
  } catch (err) { return next(err) }
}

export const resetAgentPassword = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    await TeamScope.resetTeamPassword(
      Number(req.params.id),
      req.body.password,
      req.user
    )
    return sendSuccess(res, null, 'Password reset successfully')
  } catch (err) { return next(err) }
}

export const getAgentStats = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const stats = await TeamScope.getTeamStats(req.user)
    return sendSuccess(res, stats, 'Team user stats fetched')
  } catch (err) { return next(err) }
}
