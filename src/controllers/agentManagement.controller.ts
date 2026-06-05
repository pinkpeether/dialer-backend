import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as AgentManagementService from '../services/agentManagement.service'

const getIpAddress = (req: AuthRequest) => {
  const forwardedFor = req.headers['x-forwarded-for']
  if (Array.isArray(forwardedFor)) return forwardedFor[0] || null
  if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0]?.trim() || null
  return req.ip || null
}

export const overview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.getAgentOverview(req.query)
    return sendSuccess(res, result, 'Advanced agent overview fetched')
  } catch (err) {
    return next(err)
  }
}

export const leaderboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.getLeaderboard(req.query)
    return sendSuccess(res, result, 'Agent leaderboard fetched')
  } catch (err) {
    return next(err)
  }
}

export const performance = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.getAgentPerformance(req.query)
    return sendSuccess(res, result, 'Agent performance report fetched')
  } catch (err) {
    return next(err)
  }
}

export const shifts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.getShiftPlan(req.query)
    return sendSuccess(res, result, 'Agent shift plan fetched')
  } catch (err) {
    return next(err)
  }
}

export const updateShift = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.updateShiftPreference(
      Number(req.params.agentId),
      req.body,
    )
    return sendSuccess(res, result, 'Agent shift preference updated')
  } catch (err) {
    return next(err)
  }
}

export const breakReminders = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.getBreakReminders()
    return sendSuccess(res, result, 'Agent break reminders fetched')
  } catch (err) {
    return next(err)
  }
}

export const startSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.startAgentSession(
      req.user!.id,
      req.user!.email,
      String(req.body.clientFingerprint || ''),
      req.headers['user-agent'],
      getIpAddress(req),
    )
    return sendSuccess(res, result, 'Agent session started')
  } catch (err) {
    return next(err)
  }
}

export const endSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.endAgentSession(req.user!.id)
    return sendSuccess(res, result, 'Agent session ended')
  } catch (err) {
    return next(err)
  }
}

export const forceEndSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.endAgentSession(Number(req.params.agentId))
    return sendSuccess(res, result, 'Agent session terminated')
  } catch (err) {
    return next(err)
  }
}

export const sessions = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await AgentManagementService.listAgentSessions()
    return sendSuccess(res, result, 'Agent sessions fetched')
  } catch (err) {
    return next(err)
  }
}
