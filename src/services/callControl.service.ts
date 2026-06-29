import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import logger from '../utils/logger'
import { logAuditEvent } from './audit.service'
import { transferBackendOriginatedCall } from './asteriskAmi.service'
import * as Scope from './commercialScope.service'

type Actor = {
  id: number
  role?: string
  email?: string
}

type RunActionInput = {
  action: string
  payload: Record<string, unknown>
  actor: Actor
  ipAddress?: string | null
}

type ActionStatus =
  | 'COMPLETED'
  | 'ACKNOWLEDGED'
  | 'NEEDS_PROVIDER_SETUP'
  | 'NEEDS_CONFERENCE_CONTEXT'
  | 'NOT_SUPPORTED_FOR_CURRENT_PROVIDER'

const safeString = (value: unknown) => String(value || '').trim()

const getCall = async (payload: Record<string, unknown>, actor?: Actor) => {
  const callId = Number(payload.callId)
  const providerCallId = safeString(payload.providerCallId)

  if (Number.isFinite(callId) && callId > 0) {
    const call = await prisma.call.findFirst({
      where: { id: callId, ...(await Scope.callScopeWhere(actor)) },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        agent: { select: { id: true, name: true, email: true, role: true } },
        campaign: { select: { id: true, name: true } },
      },
    })
    if (!call) throw new AppError('Call not found', 404)
    return call
  }

  if (providerCallId) {
    const call = await prisma.call.findFirst({
      where: { providerCallId, ...(await Scope.callScopeWhere(actor)) },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        agent: { select: { id: true, name: true, email: true, role: true } },
        campaign: { select: { id: true, name: true } },
      },
    })
    if (!call) throw new AppError('Call not found for supplied provider call ID', 404)
    return call
  }

  throw new AppError('callId or providerCallId is required', 400)
}

const assertControlAllowed = (actor: Actor, call: Awaited<ReturnType<typeof getCall>>) => {
  const role = String(actor.role || '').toUpperCase()
  if (role === 'ADMIN' || role === 'CUSTOMER_ADMIN' || role === 'SUPERVISOR') return

  if (role === 'AGENT' && call.agentId === actor.id) return

  throw new AppError('Forbidden — call-control action not allowed for this user', 403)
}

const audit = async (
  actor: Actor,
  action: string,
  entityId: string | number | null,
  metadata: Record<string, unknown>,
  ipAddress?: string | null
) => {
  try {
    await logAuditEvent({
      actor,
      action,
      entity: 'CallControl',
      entityId: entityId === null ? undefined : String(entityId),
      metadata,
      ipAddress,
    })
  } catch (err) {
    logger.warn(`Call-control audit failed: ${err}`)
  }
}

const withResult = (
  action: string,
  status: ActionStatus,
  message: string,
  details: Record<string, unknown> = {}
) => ({
  action,
  status,
  message,
  details,
  processedAt: new Date().toISOString(),
})

const markCallCompleted = async (callId: number, action: string, notes?: string) => {
  await prisma.call.update({
    where: { id: callId },
    data: {
      status: 'COMPLETED',
      endedAt: new Date(),
      notes: notes ? `${notes}` : undefined,
    },
  }).catch(() => null)

  logger.info(`Call ${callId} marked completed by ${action}`)
}

const providerName = () => process.env.SIP_TRUNK_PROVIDER || process.env.CALL_PROVIDER || 'sip_trunk'

export const getCapabilities = () => ({
  provider: providerName(),
  providerAdapterConfigured: false,
  publicWebhookBaseConfigured: false,
  actions: {
    hangup: {
      status: 'READY',
      notes: 'Call record completion works immediately. Live carrier hangup can be added per PBX or trunk adapter.',
    },
    dtmf: {
      status: 'READY',
      notes: 'DTMF action is acknowledged at the unified control layer and can be expanded through a PBX adapter.',
    },
    hold: {
      status: 'NEEDS_PROVIDER',
      notes: 'Hold requires a PBX, ARI, AMI, or trunk-specific live control adapter.',
    },
    transfer: {
      status: 'READY',
      notes: 'Transfer uses PBX live-call control when Asterisk AMI is enabled.',
    },
    conference: {
      status: 'NEEDS_PROVIDER',
      notes: 'Conference requires provider or PBX conference orchestration.',
    },
    whisper: {
      status: 'NEEDS_PROVIDER',
      notes: 'Whisper requires supervisor join support at the PBX or media layer.',
    },
    barge: {
      status: 'NEEDS_PROVIDER',
      notes: 'Barge-in requires supervisor join support at the PBX or media layer.',
    },
    voicemailDrop: {
      status: 'NEEDS_PROVIDER',
      notes: 'Voicemail drop requires media playback injection from the PBX or carrier side.',
    },
    mute: {
      status: 'NEEDS_CONFERENCE_CONTEXT',
      notes: 'Mute and unmute require participant-level media context from a PBX conference adapter.',
    },
    noiseCancellation: {
      status: 'NEEDS_PROVIDER',
      notes: 'Noise cancellation belongs in browser DSP or provider media services, not in the current backend.',
    },
  },
})

export const getActiveCalls = async (actor?: Actor) => {
  const calls = await prisma.call.findMany({
    where: {
      ...(await Scope.callScopeWhere(actor)),
      status: { in: ['INITIATED', 'RINGING', 'ANSWERED'] },
    },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      agent: { select: { id: true, name: true, email: true, role: true } },
      campaign: { select: { id: true, name: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 50,
  })

  return {
    calls,
    count: calls.length,
    generatedAt: new Date().toISOString(),
  }
}

export const runControlAction = async ({ action, payload, actor, ipAddress }: RunActionInput) => {
  const normalized = String(action || '').trim().toLowerCase()
  if (!normalized) throw new AppError('Action is required', 400)

  const call = await getCall(payload, actor)
  assertControlAllowed(actor, call)

  const providerCallId = safeString(payload.providerCallId) || safeString(call.providerCallId)
  const callId = Number(call.id)
  const room = safeString(payload.room) || `ptdt-call-${callId}`
  let result: ReturnType<typeof withResult>

  switch (normalized) {
    case 'hangup': {
      await markCallCompleted(
        callId,
        'hangup',
        providerCallId
          ? `Call ended from PTDT control layer for provider reference ${providerCallId}.`
          : 'Call ended from PTDT control layer without provider reference.'
      )
      result = withResult(normalized, providerCallId ? 'COMPLETED' : 'ACKNOWLEDGED', 'Call marked completed.', {
        callId,
        providerCallId: providerCallId || null,
      })
      break
    }

    case 'dtmf': {
      const digits = safeString(payload.digits)
      if (!digits) throw new AppError('digits is required for DTMF', 400)
      result = withResult(normalized, 'COMPLETED', 'DTMF request acknowledged by the control layer.', {
        callId,
        providerCallId: providerCallId || null,
        digits,
      })
      break
    }

    case 'transfer': {
      const target =
        safeString(payload.target) ||
        safeString(payload.transferTo) ||
        safeString(payload.destination) ||
        safeString(payload.toNumber)

      if (!target) throw new AppError('Transfer destination is required', 400)

      const transfer = await transferBackendOriginatedCall({
        callId,
        providerCallId: providerCallId || null,
        phone: safeString(call.remoteNumber) || null,
        agentExtension: safeString(payload.agentExtension) || null,
        target,
      })

      result = withResult(
        normalized,
        transfer.enabled ? 'COMPLETED' : 'NEEDS_PROVIDER_SETUP',
        transfer.enabled ? 'Transfer requested.' : 'Transfer adapter is not enabled.',
        {
          callId,
          providerCallId: providerCallId || null,
          destinationType: transfer.targetKind,
          context: transfer.context,
          channelCount: transfer.channels.length,
        }
      )
      break
    }

    case 'hold':
    case 'resume':
    case 'conference':
    case 'whisper':
    case 'barge':
    case 'voicemaildrop':
    case 'voicemail-drop':
    case 'voicemail_drop':
    case 'noisecancellation':
    case 'noise-cancellation': {
      const actionName = normalized.replace(/[-_]/g, '')
      result = withResult(
        actionName === 'voicemaildrop' ? 'voicemailDrop' : actionName === 'noisecancellation' ? 'noiseCancellation' : normalized,
        'NEEDS_PROVIDER_SETUP',
        `${normalized} requires a live PBX or SIP trunk control adapter and is not wired in the backend yet.`,
        {
          callId,
          providerCallId: providerCallId || null,
          room,
          provider: providerName(),
        }
      )
      break
    }

    case 'mute':
    case 'unmute': {
      result = withResult(normalized, 'NEEDS_CONFERENCE_CONTEXT', `${normalized} requires participant-level conference context.`, {
        callId,
        providerCallId: providerCallId || null,
        conferenceSid: safeString(payload.conferenceSid) || null,
        participantCallSid: safeString(payload.participantCallSid) || null,
      })
      break
    }

    default:
      throw new AppError(`Unsupported call-control action: ${action}`, 400)
  }

  await audit(
    actor,
    `CALL_CONTROL_${result.action.toUpperCase()}`,
    callId,
    {
      action: result.action,
      status: result.status,
      message: result.message,
      details: result.details,
    },
    ipAddress
  )

  return result
}
