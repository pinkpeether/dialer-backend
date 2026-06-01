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

const normalizeDigits = (value?: string | null) => {
  return String(value || '').replace(/\D/g, '')
}

const lastDigits = (value?: string | null, length = 10) => {
  return normalizeDigits(value).slice(-length)
}

const numbersMatch = (candidate?: string | null, target?: string | null) => {
  const candidateDigits = normalizeDigits(candidate)
  const targetDigits = normalizeDigits(target)

  if (!candidateDigits || !targetDigits) return false
  if (candidateDigits.includes(targetDigits) || targetDigits.includes(candidateDigits)) return true

  const candidateTail = lastDigits(candidateDigits)
  const targetTail = lastDigits(targetDigits)

  return Boolean(candidateTail && targetTail && candidateTail === targetTail)
}

const timeWindow = (centerTime: Date, windowMinutes: number) => {
  return {
    from: new Date(centerTime.getTime() - windowMinutes * 60 * 1000),
    to: new Date(centerTime.getTime() + windowMinutes * 60 * 1000),
  }
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

const parseFreepbxRecordingFile = (recordingfile: string) => {
  // Example:
  // out-5512943079-1001-20260529-222011-1780093211.8.wav
  const match = recordingfile.match(
    /^out-(?<dst>\d+)-(?<src>\d+)-(?<date>\d{8})-(?<time>\d{6})-(?<uniqueid>.+)\.[^.]+$/i
  )

  if (!match?.groups) return null

  const { dst, src, date, time, uniqueid } = match.groups

  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(4, 6))
  const day = Number(date.slice(6, 8))
  const hour = Number(time.slice(0, 2))
  const minute = Number(time.slice(2, 4))
  const second = Number(time.slice(4, 6))

  const startedAt = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (Number.isNaN(startedAt.getTime())) return null

  return {
    dst,
    src,
    uniqueid,
    startedAt,
  }
}

const findCallForIngest = async (req: Request, recordingfile: string) => {
  const callIdRaw = req.body.callId
  const callId = callIdRaw ? Number(callIdRaw) : NaN

  if (Number.isInteger(callId) && callId > 0) {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: {
        id: true,
        recordingUrl: true,
        recordingSid: true,
        remoteNumber: true,
        source: true,
        disposition: true,
        startedAt: true,
        createdAt: true,
      },
    })

    if (!call) {
      throw new AppError('Call not found', 404)
    }

    return {
      call,
      matchStrategy: 'callId',
    }
  }

  const existingRecording = await prisma.call.findFirst({
    where: {
      source: 'sip',
      recordingSid: recordingfile,
      recordingUrl: { not: null },
    },
    orderBy: [
      { updatedAt: 'desc' },
      { id: 'desc' },
    ],
    select: {
      id: true,
      recordingUrl: true,
      recordingSid: true,
      remoteNumber: true,
      source: true,
      disposition: true,
      providerCallId: true,
      startedAt: true,
      createdAt: true,
    },
  })

  if (existingRecording) {
    return {
      call: existingRecording,
      matchStrategy: 'recordingfile_existing_sid',
    }
  }

  const parsed = parseFreepbxRecordingFile(recordingfile)
  const bodyDst = normalizeDigits(req.body.dst)
  const bodySrc = normalizeDigits(req.body.src)
  const targetNumber = parsed?.dst || bodyDst || bodySrc

  if (!targetNumber) {
    throw new AppError('Valid callId or matchable recordingfile/dst is required for recording ingest', 400)
  }

  const centerTime = parsed?.startedAt || new Date()
  const uniqueIdDigits = normalizeDigits(parsed?.uniqueid)

  const select = {
    id: true,
    recordingUrl: true,
    remoteNumber: true,
    source: true,
    disposition: true,
    providerCallId: true,
    recordingSid: true,
    startedAt: true,
    createdAt: true,
  }

  const findCandidate = async (
    strategy: string,
    windowMinutes: number,
    options: { unrecordedOnly: boolean }
  ) => {
    const { from, to } = timeWindow(centerTime, windowMinutes)

    const candidates = await prisma.call.findMany({
      where: {
        source: 'sip',
        ...(options.unrecordedOnly ? { recordingUrl: null } : {}),
        startedAt: {
          gte: from,
          lte: to,
        },
      },
      orderBy: [
        { startedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: 150,
      select,
    })

    const matching = candidates
      .filter((candidate) => {
        const remoteMatches = numbersMatch(candidate.remoteNumber, targetNumber)
        const providerMatches = Boolean(
          uniqueIdDigits &&
          normalizeDigits(candidate.providerCallId).includes(uniqueIdDigits)
        )

        return remoteMatches || providerMatches
      })
      .sort((a, b) => {
        const aProviderMatch = uniqueIdDigits && normalizeDigits(a.providerCallId).includes(uniqueIdDigits)
        const bProviderMatch = uniqueIdDigits && normalizeDigits(b.providerCallId).includes(uniqueIdDigits)

        if (aProviderMatch && !bProviderMatch) return -1
        if (!aProviderMatch && bProviderMatch) return 1

        const aDiff = Math.abs(a.startedAt.getTime() - centerTime.getTime())
        const bDiff = Math.abs(b.startedAt.getTime() - centerTime.getTime())

        return aDiff - bDiff
      })

    const call = matching[0]
    return call ? { call, matchStrategy: strategy } : null
  }

  const match =
    (await findCandidate('recordingfile_exact_time_number', 15, { unrecordedOnly: true })) ||
    (await findCandidate('recordingfile_near_time_number', 45, { unrecordedOnly: true })) ||
    (await findCandidate('recordingfile_near_time_any_number', 45, { unrecordedOnly: false }))

  const call = match?.call

  if (!call) {
    throw new AppError(
      `No matching SIP call found for recordingfile=${recordingfile} target=${targetNumber}`,
      404
    )
  }

  return {
    call,
    matchStrategy: match.matchStrategy,
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

    const recordingfile = String(req.body.recordingfile || file.originalname || '')
    if (!recordingfile) {
      throw new AppError('recordingfile is required', 400)
    }

    const { call, matchStrategy } = await findCallForIngest(req, recordingfile)

    if (call.recordingUrl && call.recordingSid === recordingfile) {
      return sendSuccess(
        res,
        {
          match: {
            strategy: matchStrategy,
            callId: call.id,
            remoteNumber: call.remoteNumber,
            startedAt: call.startedAt,
          },
          call: {
            id: call.id,
            recordingSid: call.recordingSid,
            recordingUrlPreview: call.recordingUrl.slice(0, 120) + '...',
          },
          storage: {
            alreadyIngested: true,
          },
        },
        'FreePBX recording already ingested'
      )
    }

    const ext = getExtension(file.originalname || recordingfile)
    tempFilePath = path.join(
      os.tmpdir(),
      `ptdt-freepbx-recording-${crypto.randomUUID()}${ext}`
    )

    await fs.promises.writeFile(tempFilePath, file.buffer)

    const destinationKey = `recordings/freepbx/${new Date().toISOString().slice(0, 10).replace(/-/g, '/')}/${recordingfile.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const uploaded = await uploadRecordingAndCreateSignedUrl({
      localFilePath: tempFilePath,
      destinationKey,
      contentType: file.mimetype || 'audio/wav',
    })

    const recordingSid = String(req.body.uniqueid || req.body.linkedid || req.body.recordingfile || '')

    const updated = await prisma.call.update({
      where: { id: call.id },
      data: {
        recordingUrl: uploaded.signedUrl,
        recordingSid,
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
        match: {
          strategy: matchStrategy,
          callId: updated.id,
          remoteNumber: call.remoteNumber,
          startedAt: call.startedAt,
        },
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
