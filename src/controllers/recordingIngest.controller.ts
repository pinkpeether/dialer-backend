import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { sendSuccess } from '../utils/response'
import { uploadRecordingAndCreateSignedUrl } from '../services/recordingStorage.service'

const getExtension = (filename?: string) => {
  const ext = path.extname(filename || '').toLowerCase()
  if (ext) return ext
  return '.wav'
}

const requireIngestSecret = (req: Request) => {
  const expected = process.env.FREEPBX_INGEST_SECRET
  const provided = req.header('X-PTDT-Ingest-Secret')

  if (!expected) {
    throw new AppError('FREEPBX_INGEST_SECRET is not configured', 500)
  }

  if (!provided || provided !== expected) {
    throw new AppError('Forbidden — invalid ingest secret', 403)
  }
}

export const ingestFreepbxRecording = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let tempFilePath: string | null = null

  try {
    requireIngestSecret(req)

    const file = req.file
    if (!file) {
      throw new AppError('Recording file is required', 400)
    }

    const callIdRaw = req.body.callId
    const callId = callIdRaw ? Number(callIdRaw) : NaN

    if (!Number.isInteger(callId) || callId <= 0) {
      throw new AppError('Valid callId is required for MVP recording ingest', 400)
    }

    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: {
        id: true,
        recordingUrl: true,
        remoteNumber: true,
        source: true,
        disposition: true,
      },
    })

    if (!call) {
      throw new AppError('Call not found', 404)
    }

    const ext = getExtension(file.originalname)
    tempFilePath = path.join(
      os.tmpdir(),
      `ptdt-freepbx-recording-${crypto.randomUUID()}${ext}`
    )

    await fs.promises.writeFile(tempFilePath, file.buffer)

    const recordingfile = String(req.body.recordingfile || file.originalname || path.basename(tempFilePath))
    const destinationKey = `recordings/freepbx/${new Date().toISOString().slice(0, 10).replace(/-/g, '/')}/${recordingfile.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const uploaded = await uploadRecordingAndCreateSignedUrl({
      localFilePath: tempFilePath,
      destinationKey,
      contentType: file.mimetype || 'audio/wav',
    })

    const updated = await prisma.call.update({
      where: { id: callId },
      data: {
        recordingUrl: uploaded.signedUrl,
        recordingSid: String(req.body.uniqueid || req.body.linkedid || req.body.recordingfile || ''),
      },
      select: {
        id: true,
        recordingUrl: true,
        recordingSid: true,
      },
    })

    return sendSuccess(
      res,
      {
        call: {
          id: updated.id,
          recordingSid: updated.recordingSid,
          recordingUrlPreview: updated.recordingUrl?.slice(0, 120) + '...',
        },
        storage: {
          bucket: uploaded.bucket,
          key: uploaded.key,
          expiresInSeconds: uploaded.expiresInSeconds,
          sizeBytes: uploaded.sizeBytes,
        },
      },
      'FreePBX recording ingested'
    )
  } catch (err) {
    return next(err)
  } finally {
    if (tempFilePath) {
      await fs.promises.unlink(tempFilePath).catch(() => undefined)
    }
  }
}
