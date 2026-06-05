import twilio from 'twilio'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import logger from '../utils/logger'
import { logAuditEvent } from './audit.service'

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

const BASE_URL = process.env.WEBHOOK_BASE_URL || process.env.BASE_URL || 'http://localhost:3001'

const getTwilioClient = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new AppError('Twilio credentials are not configured', 500)
  return twilio(sid, token)
}

const safeString = (value: unknown) => String(value || '').trim()

const getCall = async (payload: Record<string, unknown>) => {
  const callId = Number(payload.callId)
  const twilioCallSid = safeString(payload.twilioCallSid)

  if (Number.isFinite(callId) && callId > 0) {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        agent: { select: { id: true, name: true, email: true, role: true } },
        campaign: { select: { id: true, name: true } },
      },
    })
    if (!call) throw new AppError('Call not found', 404)
    return call
  }

  if (twilioCallSid) {
    const call = await prisma.call.findFirst({
      where: { twilioCallSid },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        agent: { select: { id: true, name: true, email: true, role: true } },
        campaign: { select: { id: true, name: true } },
      },
    })
    if (!call) throw new AppError('Call not found for supplied Twilio SID', 404)
    return call
  }

  throw new AppError('callId or twilioCallSid is required', 400)
}

const assertControlAllowed = (actor: Actor, call: Awaited<ReturnType<typeof getCall>>) => {
  const role = String(actor.role || '').toUpperCase()
  if (role === 'ADMIN' || role === 'SUPERVISOR') return

  // Agents can only control their own assigned call.
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

export const getCapabilities = () => {
  const hasTwilio = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  const hasPublicWebhookBase = Boolean(process.env.WEBHOOK_BASE_URL || process.env.BASE_URL)

  return {
    provider: process.env.CALL_PROVIDER || 'universal-sip',
    twilioLegacyConfigured: hasTwilio,
    publicWebhookBaseConfigured: hasPublicWebhookBase,
    actions: {
      hangup: {
        status: 'READY',
        notes: 'Works for legacy Twilio calls with twilioCallSid. SIP/PBX calls need provider adapter.',
      },
      dtmf: {
        status: 'READY',
        notes: 'Already supported by /api/dialer/call/dtmf for Twilio; included here for unified UI.',
      },
      hold: {
        status: hasTwilio ? 'PARTIAL_READY' : 'NEEDS_PROVIDER',
        notes: 'Twilio live-call redirect to hold-music TwiML. Resume requires original connect route.',
      },
      transfer: {
        status: hasTwilio ? 'PARTIAL_READY' : 'NEEDS_PROVIDER',
        notes: 'Twilio live-call redirect to dial target number. PBX transfer will be added after VPS/Asterisk AMI/ARI setup.',
      },
      conference: {
        status: hasTwilio ? 'PARTIAL_READY' : 'NEEDS_PROVIDER',
        notes: 'Twilio conference TwiML redirect. Full agent/supervisor conference needs provider-level room tracking.',
      },
      whisper: {
        status: hasTwilio && hasPublicWebhookBase ? 'PARTIAL_READY' : 'NEEDS_PROVIDER',
        notes: 'Supervisor join to conference room supported for Twilio room mode. Native Asterisk whisper requires PBX adapter.',
      },
      barge: {
        status: hasTwilio && hasPublicWebhookBase ? 'PARTIAL_READY' : 'NEEDS_PROVIDER',
        notes: 'Supervisor join to conference room supported. Native PBX barge requires AMI/ARI adapter.',
      },
      voicemailDrop: {
        status: hasTwilio ? 'PARTIAL_READY' : 'NEEDS_PROVIDER',
        notes: 'Can redirect live Twilio call to Say/Play message then hangup.',
      },
      mute: {
        status: 'NEEDS_CONFERENCE_CONTEXT',
        notes: 'Requires conferenceSid + participantCallSid. Will be fully wired after PBX/Twilio conference tracking.',
      },
      noiseCancellation: {
        status: 'NEEDS_PROVIDER',
        notes: 'Requires media provider/browser DSP. Placeholder guardrail prevents false claim.',
      },
    },
  }
}

export const getActiveCalls = async () => {
  const calls = await prisma.call.findMany({
    where: {
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

const updateCallTwiml = async (twilioCallSid: string, twiml: string) => {
  const client = getTwilioClient()
  await client.calls(twilioCallSid).update({ twiml })
}

const twimlHold = () => {
  return [
    '<Response>',
    '<Say voice="alice">Please hold while we connect you.</Say>',
    '<Play loop="0">http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical</Play>',
    '</Response>',
  ].join('')
}

const twimlTransfer = (targetNumber: string) => {
  const VoiceResponse = twilio.twiml.VoiceResponse
  const response = new VoiceResponse()
  const dial = response.dial({ timeout: 30, record: 'record-from-answer' } as never)
  ;(dial as never as { number: (phone: string) => void }).number(targetNumber)
  return response.toString()
}

const twimlConference = (room: string) => {
  const VoiceResponse = twilio.twiml.VoiceResponse
  const response = new VoiceResponse()
  const dial = response.dial({ timeout: 30, record: 'record-from-answer' } as never)
  ;(dial as never as { conference: (name: string, attrs: object) => void }).conference(room, {
    startConferenceOnEnter: true,
    endConferenceOnExit: true,
    waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
  })
  return response.toString()
}

const twimlVoicemailDrop = (payload: Record<string, unknown>) => {
  const message = safeString(payload.message) || 'Thank you. We tried to reach you today. Please call us back when convenient.'
  const audioUrl = safeString(payload.audioUrl)

  const VoiceResponse = twilio.twiml.VoiceResponse
  const response = new VoiceResponse()

  if (audioUrl) {
    response.play(audioUrl)
  } else {
    response.say({ voice: 'alice', language: 'en-US' }, message)
  }

  response.hangup()
  return response.toString()
}

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

export const generateSupervisorJoinTwiml = (room: string, mode: string) => {
  if (!room) throw new AppError('room is required', 400)

  const normalizedMode = String(mode || 'whisper').toLowerCase()
  const muted = normalizedMode === 'whisper'

  const VoiceResponse = twilio.twiml.VoiceResponse
  const response = new VoiceResponse()
  const dial = response.dial()

  ;(dial as never as { conference: (name: string, attrs: object) => void }).conference(room, {
    muted,
    beep: false,
    startConferenceOnEnter: true,
    endConferenceOnExit: false,
  })

  return response.toString()
}

const callSupervisorIntoRoom = async (
  room: string,
  supervisorPhone: string,
  mode: string
) => {
  const from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER
  if (!from) throw new AppError('Twilio from number is not configured', 500)

  const callbackUrl = `${BASE_URL}/api/call-controls/twiml/supervisor?room=${encodeURIComponent(room)}&mode=${encodeURIComponent(mode)}`
  const client = getTwilioClient()

  const call = await client.calls.create({
    to: supervisorPhone,
    from,
    url: callbackUrl,
    method: 'POST',
  })

  return {
    supervisorCallSid: call.sid,
    callbackUrl,
  }
}

export const runControlAction = async ({ action, payload, actor, ipAddress }: RunActionInput) => {
  const normalized = String(action || '').trim().toLowerCase()
  if (!normalized) throw new AppError('Action is required', 400)

  const actionsWithoutExistingCall = ['capabilities']
  const needsCall = !actionsWithoutExistingCall.includes(normalized)

  const call = needsCall ? await getCall(payload) : null
  if (call) assertControlAllowed(actor, call)

  const twilioCallSid = safeString(payload.twilioCallSid) || safeString(call?.twilioCallSid)
  const callId = Number(call?.id || payload.callId || 0)
  const room = safeString(payload.room) || (callId ? `ptdt-call-${callId}` : safeString(payload.conferenceRoom))
  let result: ReturnType<typeof withResult>

  switch (normalized) {
    case 'hangup': {
      if (!twilioCallSid) {
        if (callId) {
          await markCallCompleted(callId, 'hangup', 'Hangup requested locally; no provider call SID was attached.')
          result = withResult(normalized, 'ACKNOWLEDGED', 'Local call marked completed. Provider hangup needs call SID.', { callId })
          break
        }
        throw new AppError('twilioCallSid or callId is required for hangup', 400)
      }

      const client = getTwilioClient()
      await client.calls(twilioCallSid).update({ status: 'completed' })
      if (callId) await markCallCompleted(callId, 'hangup')
      result = withResult(normalized, 'COMPLETED', 'Call hangup sent to provider.', { callId, twilioCallSid })
      break
    }

    case 'hold': {
      if (!twilioCallSid) {
        result = withResult(normalized, 'NOT_SUPPORTED_FOR_CURRENT_PROVIDER', 'Hold requires a live provider call SID.', { callId })
        break
      }
      await updateCallTwiml(twilioCallSid, twimlHold())
      result = withResult(normalized, 'COMPLETED', 'Hold music TwiML sent to live call.', { callId, twilioCallSid })
      break
    }

    case 'resume': {
      if (!twilioCallSid || !callId) {
        result = withResult(normalized, 'NOT_SUPPORTED_FOR_CURRENT_PROVIDER', 'Resume requires callId and live provider call SID.', { callId })
        break
      }
      await updateCallTwiml(twilioCallSid, `<Response><Redirect method="POST">${BASE_URL}/api/dialer/twiml/connect/${callId}</Redirect></Response>`)
      result = withResult(normalized, 'COMPLETED', 'Call redirected back to PTDT connect flow.', { callId, twilioCallSid })
      break
    }

    case 'transfer': {
      const targetNumber = safeString(payload.targetNumber || payload.to || payload.phone)
      if (!targetNumber) throw new AppError('targetNumber is required for transfer', 400)
      if (!twilioCallSid) {
        result = withResult(normalized, 'NOT_SUPPORTED_FOR_CURRENT_PROVIDER', 'Transfer requires a live provider call SID.', { callId, targetNumber })
        break
      }
      await updateCallTwiml(twilioCallSid, twimlTransfer(targetNumber))
      result = withResult(normalized, 'COMPLETED', 'Transfer TwiML sent to live call.', { callId, twilioCallSid, targetNumber })
      break
    }

    case 'conference': {
      if (!twilioCallSid) {
        result = withResult(normalized, 'NOT_SUPPORTED_FOR_CURRENT_PROVIDER', 'Conference requires a live provider call SID.', { callId, room })
        break
      }
      await updateCallTwiml(twilioCallSid, twimlConference(room))
      result = withResult(normalized, 'COMPLETED', 'Conference TwiML sent to live call.', { callId, twilioCallSid, room })
      break
    }

    case 'whisper':
    case 'barge': {
      const supervisorPhone = safeString(payload.supervisorPhone)
      if (!supervisorPhone) {
        result = withResult(normalized, 'NEEDS_PROVIDER_SETUP', 'Supervisor phone is required to join whisper/barge in legacy Twilio mode.', { callId, room })
        break
      }
      const supervisor = await callSupervisorIntoRoom(room, supervisorPhone, normalized)
      result = withResult(normalized, 'COMPLETED', `Supervisor ${normalized} join call initiated.`, {
        callId,
        room,
        mode: normalized,
        ...supervisor,
      })
      break
    }

    case 'voicemaildrop':
    case 'voicemail-drop':
    case 'voicemail_drop': {
      if (!twilioCallSid) {
        result = withResult('voicemailDrop', 'NOT_SUPPORTED_FOR_CURRENT_PROVIDER', 'Voicemail drop requires a live provider call SID.', { callId })
        break
      }
      await updateCallTwiml(twilioCallSid, twimlVoicemailDrop(payload))
      if (callId) {
        await prisma.call.update({
          where: { id: callId },
          data: { disposition: 'VOICEMAIL', status: 'COMPLETED', endedAt: new Date() },
        }).catch(() => null)
      }
      result = withResult('voicemailDrop', 'COMPLETED', 'Voicemail drop TwiML sent and call will hang up.', { callId, twilioCallSid })
      break
    }

    case 'mute':
    case 'unmute': {
      const conferenceSid = safeString(payload.conferenceSid)
      const participantCallSid = safeString(payload.participantCallSid || twilioCallSid)
      if (!conferenceSid || !participantCallSid) {
        result = withResult(normalized, 'NEEDS_CONFERENCE_CONTEXT', 'Mute/unmute requires conferenceSid and participantCallSid.', {
          callId,
          twilioCallSid,
        })
        break
      }
      const client = getTwilioClient()
      await client.conferences(conferenceSid)
        .participants(participantCallSid)
        .update({ muted: normalized === 'mute' })
      result = withResult(normalized, 'COMPLETED', `Participant ${normalized === 'mute' ? 'muted' : 'unmuted'}.`, {
        callId,
        conferenceSid,
        participantCallSid,
      })
      break
    }

    case 'dtmf': {
      const digits = safeString(payload.digits)
      if (!digits) throw new AppError('digits is required for DTMF', 400)
      if (!twilioCallSid) {
        result = withResult(normalized, 'NOT_SUPPORTED_FOR_CURRENT_PROVIDER', 'DTMF requires a live provider call SID.', { callId, digits })
        break
      }
      await updateCallTwiml(twilioCallSid, `<Response><Play digits="${digits.replace(/"/g, '')}"/></Response>`)
      result = withResult(normalized, 'COMPLETED', 'DTMF digits sent.', { callId, twilioCallSid, digits })
      break
    }

    case 'noisecancellation':
    case 'noise-cancellation': {
      result = withResult('noiseCancellation', 'NEEDS_PROVIDER_SETUP', 'Noise cancellation requires browser DSP/provider media support and is intentionally guarded.', {
        callId,
        supportedAfter: 'Public PBX/WebRTC media adapter',
      })
      break
    }

    default:
      throw new AppError(`Unsupported call-control action: ${action}`, 400)
  }

  await audit(actor, `CALL_CONTROL_${result.action.toUpperCase()}`, callId || null, {
    action: result.action,
    status: result.status,
    message: result.message,
    details: result.details,
  }, ipAddress)

  return result
}
