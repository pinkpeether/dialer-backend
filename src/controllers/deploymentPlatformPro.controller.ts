import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess, sendError } from '../utils/response'
import {
  getDeploymentPlatformOverview,
  getDeploymentPlatformChecklist,
  getDeploymentSmokeCommands,
} from '../services/deploymentPlatformPro.service'

export const getDeploymentPlatformOverviewController = async (_req: AuthRequest, res: Response) => {
  try {
    return sendSuccess(res, getDeploymentPlatformOverview(), 'Deployment platform overview loaded')
  } catch (error) {
    return sendError(res, 'Failed to load deployment platform overview', 500, error)
  }
}

export const getDeploymentPlatformChecklistController = async (_req: AuthRequest, res: Response) => {
  try {
    return sendSuccess(res, getDeploymentPlatformChecklist(), 'Deployment platform checklist loaded')
  } catch (error) {
    return sendError(res, 'Failed to load deployment platform checklist', 500, error)
  }
}

export const getDeploymentSmokeCommandsController = async (_req: AuthRequest, res: Response) => {
  try {
    return sendSuccess(res, getDeploymentSmokeCommands(), 'Deployment smoke commands loaded')
  } catch (error) {
    return sendError(res, 'Failed to load deployment smoke commands', 500, error)
  }
}
