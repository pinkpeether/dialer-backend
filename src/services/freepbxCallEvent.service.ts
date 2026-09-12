import type { CallDisposition, CallStatus, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { callingBillingService } from './callingBilling.service'
import { emitToDashboard } from '../socket/socket.server'

type FreepbxCallEventInput = {
  event?: unknown
  callId?: unknown
  providerCallId?: unknown
  uniqueid?: unknown
  uniqueId?: unknown
  linkedid?: unknown
  linkedId?: unknown
  src?: unknown
  dst?: unknown
  source?: unknown
  destination?: unknown
  startedAt?: unknown
  start?: unknown
  answeredAt?: unknown
  answer?: unknown
  endedAt?: unknown
  end?: unknown
  durationSeconds?: unknown
  duration?: unknown
  billsec?: unknown
  disposition?: unknown
}

const text = (value: unknown) => String(value || '').trim()

const parseDate = (value: unknown) => {
  const raw = text(value)
  if (!raw) return undefined
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

const parseNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

const parseDuration = (input: FreepbxCallEventInput) => {
  const preferred = parseNumber(input.billsec) ?? parseNumber(input.durationSeconds) ?? parseNumber(input.duration)
  return preferred === undefined ? undefined : Math.max(0, Math.round(preferred))
}

const normalizeDisposition = (value: unknown, durationSeconds?: number): CallDisposition | null => {
  const raw = text(value).toUpperCase().replace(/[\s-]+/g, '_')
  if (raw.includes('ANSWER') && raw !== 'NO_ANSWER') return 'ANSWERED'
  if (raw.includes('NO_ANSWER') || raw.includes('NOANSWER')) return 'NO_ANSWER'
  if (raw.includes('BUSY')) return 'NO_ANSWER'
  if (raw.includes('VOICEMAIL')) return 'VOICEMAIL'
  if (raw.includes('FAILED') || raw.includes('CONGESTION') || raw.includes('CHANUNAVAIL')) return 'NO_ANSWER'
  if (durationSeconds !== undefined) return durationSeconds > 0 ? 'ANSWERED' : 'NO_ANSWER'
  return null
}

const statusForEvent = (event: string, durationSeconds?: number): CallStatus => {
  if (event.includes('answer') || event === 'answered') return 'ANSWERED'
  if (event.includes('end') || event.includes('hangup') || event.includes('cdr') || event.includes('complete')) {
    return durationSeconds && durationSeconds > 0 ? 'COMPLETED' : 'NO_ANSWER'
  }
  return 'RINGING'
}

const findCall = async (input: FreepbxCallEventInput) => {
  const callId = parseNumber(input.callId)
  if (callId && Number.isInteger(callId) && callId > 0) {
    const call = await prisma.call.findUnique({ where: { id: callId }, include: { campaign: { select: { commercialAccountId: true } } } })
    if (!call) throw new AppError('Call not found for supplied callId', 404)
    return { call, matchStrategy: 'callId' }
  }

  const providerRefs = [
    text(input.providerCallId),
    text(input.uniqueid || input.uniqueId),
    text(input.linkedid || input.linkedId),
  ].filter(Boolean)

  for (const ref of providerRefs) {
    const calls = await prisma.call.findMany({
      where: {
        OR: [
          { providerCallId: ref },
          { recordingSid: ref },
        ],
      },
      include: { campaign: { select: { commercialAccountId: true } } },
      orderBy: { startedAt: 'desc' },
      take: 2,
    })

    if (calls.length > 1) {
      throw new AppError('Ambiguous FreePBX call event provider reference; exact callId is required.', 409)
    }
    if (calls[0]) return { call: calls[0], matchStrategy: 'provider-reference-exact' }
  }

  throw new AppError('FreePBX call event requires an exact PTDT callId or previously persisted provider reference. Number/time matching is disabled for billing safety.', 422)
}

const emitCallEnded = (call: { id: number; agentId: number | null; remoteNumber: string | null; duration: number | null; status: string; campaign?: { commercialAccountId: number | null } | null }) => {
  try {
    emitToDashboard('call:ended', {
      callId: call.id,
      agentId: call.agentId || 0,
      commercialAccountId: call.campaign?.commercialAccountId ?? null,
      phone: call.remoteNumber || 'Unknown',
      name: call.remoteNumber || 'Unknown',
      duration: call.duration || 0,
      status: call.status,
    }, call.campaign?.commercialAccountId ?? null)
  } catch {
    // Socket server may not be initialized in scripts/tests.
  }
}

export const ingestFreepbxCallEvent = async (input: FreepbxCallEventInput) => {
  const event = text(input.event || 'cdr').toLowerCase()
  const startedAt = parseDate(input.startedAt || input.start)
  const answeredAt = parseDate(input.answeredAt || input.answer)
  const endedAt = parseDate(input.endedAt || input.end) || (event.includes('end') || event.includes('hangup') || event.includes('cdr') ? new Date() : undefined)
  const durationSeconds = parseDuration(input) ?? (answeredAt && endedAt
    ? Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000))
    : undefined)
  const disposition = normalizeDisposition(input.disposition, durationSeconds)
  const status = statusForEvent(event, durationSeconds)
  const { call, matchStrategy } = await findCall(input)

  const data: Prisma.CallUpdateInput = {
    status,
    ...(startedAt ? { startedAt } : {}),
    ...(answeredAt ? { connectedAt: answeredAt } : {}),
    ...(endedAt ? { endedAt } : {}),
    ...(durationSeconds !== undefined ? { duration: durationSeconds } : {}),
    ...(disposition ? { disposition } : {}),
    ...(text(input.uniqueid || input.uniqueId || input.linkedid || input.linkedId) && !call.providerCallId
      ? { providerCallId: text(input.uniqueid || input.uniqueId || input.linkedid || input.linkedId) }
      : {}),
  }

  const updated = await prisma.call.update({
    where: { id: call.id },
    data,
    include: { campaign: { select: { commercialAccountId: true } } },
  })

  if (endedAt || status === 'COMPLETED' || status === 'NO_ANSWER') {
    if (durationSeconds && durationSeconds > 0) {
      await callingBillingService.settleCallAuthorization(updated.id, durationSeconds)
    } else {
      await callingBillingService.releaseCallAuthorization(updated.id)
    }
    emitCallEnded(updated)
  }

  return {
    matched: { callId: updated.id, strategy: matchStrategy },
    call: {
      id: updated.id,
      status: updated.status,
      disposition: updated.disposition,
      startedAt: updated.startedAt,
      connectedAt: updated.connectedAt,
      endedAt: updated.endedAt,
      duration: updated.duration,
      providerCallId: updated.providerCallId,
    },
  }
}
