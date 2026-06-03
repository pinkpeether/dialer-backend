import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { getDialingMetrics } from '../services/dialingMetrics.service'
import { calculatePredictivePacingV2 } from '../services/predictivePacingV2.service'
import { evaluateAbandonmentGuardrails } from '../services/abandonmentGuardrails.service'

export const metrics = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await getDialingMetrics(req.query.campaignId ? Number(req.query.campaignId) : undefined)
    return sendSuccess(res, result, 'Dialing metrics fetched')
  } catch (err) {
    return next(err)
  }
}

export const pacingPreview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = calculatePredictivePacingV2({
      readyAgents: Number(req.body.readyAgents || 0),
      answerRate: Number(req.body.answerRate || 0.1),
      maxCallsPerReadyAgent: req.body.maxCallsPerReadyAgent ? Number(req.body.maxCallsPerReadyAgent) : undefined,
      safetyMultiplier: req.body.safetyMultiplier ? Number(req.body.safetyMultiplier) : undefined,
    })
    return sendSuccess(res, result, 'Predictive pacing preview calculated')
  } catch (err) {
    return next(err)
  }
}

export const guardrailPreview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = evaluateAbandonmentGuardrails({
      campaignId: Number(req.body.campaignId),
      abandonmentRate: Number(req.body.abandonmentRate || 0),
      maxAbandonmentRate: req.body.maxAbandonmentRate ? Number(req.body.maxAbandonmentRate) : undefined,
      hasDncViolations: Boolean(req.body.hasDncViolations),
      hasRetryViolations: Boolean(req.body.hasRetryViolations),
    })
    return sendSuccess(res, result, 'Guardrail preview evaluated')
  } catch (err) {
    return next(err)
  }
}
