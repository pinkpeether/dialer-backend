import { Response, NextFunction } from 'express'
import { Readable } from 'stream'
import { AuthRequest } from '../middleware/auth'
import { sendSuccess } from '../utils/response'
import { AppError } from '../middleware/errorHandler'
import * as RecordingService from '../services/recording.service'

const getDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

const getBaseApiUrl = (req: AuthRequest) => {
  const configured = process.env.API_PUBLIC_URL || process.env.BACKEND_PUBLIC_URL
  if (configured) return configured.replace(/\/$/, '').endsWith('/api')
    ? configured.replace(/\/$/, '')
    : `${configured.replace(/\/$/, '')}/api`

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()
  const proto = forwardedProto || req.protocol || 'https'
  const host = forwardedHost || req.get('host')
  return `${proto}://${host}/api`
}

const ipAddress = (req: AuthRequest) => {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || null
}

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingService.listRecordings({
      from: getDate(req.query.from),
      to: getDate(req.query.to),
      agentId: req.query.agentId ? Number(req.query.agentId) : undefined,
      campaignId: req.query.campaignId ? Number(req.query.campaignId) : undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    }, req.user)
    return sendSuccess(res, result, 'Recordings fetched')
  } catch (err) {
    return next(err)
  }
}

export const detail = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const recording = await RecordingService.getRecording(Number(req.params.callId), req.user)
    return sendSuccess(res, recording, 'Recording fetched')
  } catch (err) {
    return next(err)
  }
}

export const access = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const accessData = await RecordingService.getRecordingAccess(Number(req.params.callId), {
      actor: req.user,
      ipAddress: ipAddress(req),
      baseApiUrl: getBaseApiUrl(req),
    })
    return sendSuccess(res, accessData, 'Recording access fetched')
  } catch (err) {
    return next(err)
  }
}

export const stream = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const redirectUrl = await RecordingService.getRecordingPlaybackRedirect(
      Number(req.params.callId),
      String(req.query.token || '')
    )

    const upstream = await fetch(redirectUrl, {
      headers: req.headers.range ? { Range: String(req.headers.range) } : undefined,
    })

    if (!upstream.ok && upstream.status !== 206) {
      throw new AppError(`Recording storage returned ${upstream.status}`, 502)
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/wav')

    const contentLength = upstream.headers.get('content-length')
    const contentRange = upstream.headers.get('content-range')
    const acceptRanges = upstream.headers.get('accept-ranges')

    if (contentLength) res.setHeader('Content-Length', contentLength)
    if (contentRange) res.setHeader('Content-Range', contentRange)
    res.setHeader('Accept-Ranges', acceptRanges || 'bytes')

    res.status(upstream.status === 206 ? 206 : 200)

    if (!upstream.body) {
      throw new AppError('Recording storage returned an empty body', 502)
    }

    return Readable.fromWeb(upstream.body as any).pipe(res)
  } catch (err) {
    return next(err)
  }
}

export const health = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await RecordingService.getRecordingStorageHealth(req.user)
    return sendSuccess(res, result, 'Recording storage health fetched')
  } catch (err) {
    return next(err)
  }
}
