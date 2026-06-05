import { Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import * as LiveAiService from '../services/liveAi.service'

const toNumber = (value: unknown) => Number(value)

export const listSessions = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await LiveAiService.listLiveAiSessions()
    return sendSuccess(res, result, 'Live AI sessions fetched')
  } catch (err) {
    return next(err)
  }
}

export const startSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await LiveAiService.startLiveAiSession(toNumber(req.params.callId), req.user?.id)
    return sendSuccess(res, result, 'Live AI session started')
  } catch (err) {
    return next(err)
  }
}

export const getSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await LiveAiService.getLiveAiSession(toNumber(req.params.callId))
    return sendSuccess(res, result, 'Live AI session fetched')
  } catch (err) {
    return next(err)
  }
}

export const ingestChunk = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await LiveAiService.ingestLiveTranscriptChunk(
      toNumber(req.params.callId),
      {
        speaker: req.body.speaker,
        text: req.body.text,
        confidence: typeof req.body.confidence === 'number' ? req.body.confidence : undefined,
        source: req.body.source,
      },
      req.user?.id,
    )
    return sendSuccess(res, result, 'Live transcript chunk analyzed')
  } catch (err) {
    return next(err)
  }
}

export const getSmartScript = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await LiveAiService.getSmartScriptPrompt(toNumber(req.params.callId))
    return sendSuccess(res, result, 'Smart script fetched')
  } catch (err) {
    return next(err)
  }
}

export const applyAutoDisposition = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await LiveAiService.applyAutoDisposition(toNumber(req.params.callId), req.user?.id)
    return sendSuccess(res, result, 'Live AI auto disposition applied')
  } catch (err) {
    return next(err)
  }
}

export const createFollowUp = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await LiveAiService.createLiveAiFollowUp(
      toNumber(req.params.callId),
      req.user!.id,
      req.body.minutesFromNow ? Number(req.body.minutesFromNow) : undefined,
      req.body.notes ? String(req.body.notes) : undefined,
    )
    return sendSuccess(res, result, 'Live AI follow-up callback created')
  } catch (err) {
    return next(err)
  }
}

export const stopSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await LiveAiService.stopLiveAiSession(toNumber(req.params.callId))
    return sendSuccess(res, result, 'Live AI session stopped')
  } catch (err) {
    return next(err)
  }
}
