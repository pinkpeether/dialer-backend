import { Response, NextFunction } from 'express'
import * as AgentService from '../services/agent.service'
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

    const result = await AgentService.getAllAgents({
      role:     role as string,
      status:   status as string,
      search:   search as string,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page:     page  ? Number(page)  : 1,
      limit:    limit ? Number(limit) : 20,
    })

    return sendSuccess(res, result, 'Agents fetched')
  } catch (err) { return next(err) }
}

export const getAgentById = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const agent = await AgentService.getAgentById(Number(req.params.id))
    return sendSuccess(res, agent, 'Agent fetched')
  } catch (err) { return next(err) }
}

export const createAgent = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const agent = await AgentService.createAgent(req.body)
    return sendSuccess(res, agent, 'Agent created successfully', 201)
  } catch (err) { return next(err) }
}

export const updateAgent = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const agent = await AgentService.updateAgent(Number(req.params.id), req.body)
    return sendSuccess(res, agent, 'Agent updated successfully')
  } catch (err) { return next(err) }
}

export const deleteAgent = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    await AgentService.deleteAgent(Number(req.params.id))
    return sendSuccess(res, null, 'Agent deactivated successfully')
  } catch (err) { return next(err) }
}

export const updateAgentStatus = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const agent = await AgentService.updateAgentStatus(
      Number(req.params.id),
      req.body.status
    )
    return sendSuccess(res, agent, 'Agent status updated')
  } catch (err) { return next(err) }
}

export const resetAgentPassword = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    await AgentService.resetAgentPassword(
      Number(req.params.id),
      req.body.password
    )
    return sendSuccess(res, null, 'Password reset successfully')
  } catch (err) { return next(err) }
}

export const getAgentStats = async (
  req: AuthRequest, res: Response, next: NextFunction
) => {
  try {
    const stats = await AgentService.getAgentStats()
    return sendSuccess(res, stats, 'Agent stats fetched')
  } catch (err) { return next(err) }
}