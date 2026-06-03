import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as CallIntelligenceService from '../services/callIntelligence.service'

export const getByCall = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CallIntelligenceService.getCallIntelligence(Number(req.params.callId))
    return sendSuccess(res, result, 'Call intelligence fetched')
  } catch (err) {
    return next(err)
  }
}

export const createTranscript = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CallIntelligenceService.createTranscriptionJob(Number(req.params.callId))
    return sendSuccess(res, result, 'Transcription job queued')
  } catch (err) {
    return next(err)
  }
}


export const createInsight = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await CallIntelligenceService.createCallInsight(Number(req.params.callId))
    return sendSuccess(res, result, 'Call insight generated')
  } catch (err) {
    return next(err)
  }
}
