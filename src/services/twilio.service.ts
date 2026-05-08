import twilio from 'twilio'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import logger from '../utils/logger'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001'

// Lazy getter — prevents startup crash if TWILIO_* env vars are missing
const getClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new AppError('Twilio credentials not configured', 500)
  return twilio(sid, token)
}

// ── Initiate outbound call (campaign-based) ──
export const initiateCall = async (
  contactId:  number,
  campaignId: number,
  agentId?:   number
) => {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) throw new AppError('Contact not found', 404)

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const callRecord = await prisma.call.create({
    data: { contactId, campaignId, agentId: agentId || null, status: 'INITIATED' }
  })

  await prisma.contact.update({
    where: { id: contactId },
    data:  { status: 'CALLING', lastCalledAt: new Date() }
  })

  try {
    const client = getClient()
    const call = await client.calls.create({
      to:   contact.phone,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url:  `${BASE_URL}/api/dialer/twiml/connect/${callRecord.id}`,
      statusCallback:              `${BASE_URL}/api/dialer/webhook/status/${callRecord.id}`,
      statusCallbackMethod:        'POST',
      statusCallbackEvent:         ['initiated','ringing','answered','completed'],
      record:                      true,
      recordingStatusCallback:     `${BASE_URL}/api/dialer/webhook/recording/${callRecord.id}`,
      recordingStatusCallbackMethod: 'POST',
      machineDetection:            'Enable',
      asyncAmdStatusCallback:      `${BASE_URL}/api/dialer/webhook/amd/${callRecord.id}`,
      asyncAmdStatusCallbackMethod:'POST',
    })

    await prisma.call.update({
      where: { id: callRecord.id },
      data:  { twilioCallSid: call.sid, status: 'RINGING' }
    })

    logger.info(`📞 Call initiated: ${call.sid} → ${contact.phone}`)
    return { callRecord: { ...callRecord, twilioCallSid: call.sid }, twilioCall: call }

  } catch (err) {
    await prisma.call.update({ where: { id: callRecord.id }, data: { status: 'FAILED' } })
    await prisma.contact.update({ where: { id: contactId }, data: { status: 'NO_ANSWER' as never } })
    throw err
  }
}

// ── Initiate ad-hoc call (direct phone number, no contact/campaign required) ──
export const initiateAdhocCall = async (
  phone:   string,
  agentId: number,
  note?:   string
) => {
  // Create a minimal contact record for tracking
  const contact = await prisma.contact.create({
    data: {
      phone,
      name:   note || 'Ad-hoc Call',
      status: 'CALLING',
      lastCalledAt: new Date(),
    }
  })

  // Find or create a default ad-hoc campaign
  let campaign = await prisma.campaign.findFirst({
    where: { name: '__adhoc__' }
  })
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        name:   '__adhoc__',
        description: 'System campaign for ad-hoc manual calls',
        status: 'ACTIVE',
      }
    })
  }

  const callRecord = await prisma.call.create({
    data: {
      contactId:  contact.id,
      campaignId: campaign.id,
      agentId,
      status: 'INITIATED',
    }
  })

  try {
    const client = getClient()
    const call = await client.calls.create({
      to:   phone,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url:  `${BASE_URL}/api/dialer/twiml/connect/${callRecord.id}`,
      statusCallback:              `${BASE_URL}/api/dialer/webhook/status/${callRecord.id}`,
      statusCallbackMethod:        'POST',
      statusCallbackEvent:         ['initiated','ringing','answered','completed'],
      record:                      true,
      recordingStatusCallback:     `${BASE_URL}/api/dialer/webhook/recording/${callRecord.id}`,
      recordingStatusCallbackMethod: 'POST',
    })

    await prisma.call.update({
      where: { id: callRecord.id },
      data:  { twilioCallSid: call.sid, status: 'RINGING' }
    })

    logger.info(`📞 Ad-hoc call initiated: ${call.sid} → ${phone}`)
    return {
      callSid:    call.sid,
      callId:     callRecord.id,
      contactId:  contact.id,
      phone,
    }
  } catch (err) {
    await prisma.call.update({ where: { id: callRecord.id }, data: { status: 'FAILED' } })
    await prisma.contact.update({ where: { id: contact.id }, data: { status: 'NO_ANSWER' as never } })
    throw err
  }
}

// ── Hangup a call ──
export const hangupCall = async (twilioCallSid: string) => {
  const client = getClient()
  await client.calls(twilioCallSid).update({ status: 'completed' })
  logger.info(`📵 Call hung up: ${twilioCallSid}`)
}

// ── Send DTMF digits to active call ──
export const sendDTMF = async (twilioCallSid: string, digits: string) => {
  const client = getClient()
  await client.calls(twilioCallSid).update({
    twiml: `<Response><Play digits="${digits}"/></Response>`,
  })
  logger.info(`🔢 DTMF sent to ${twilioCallSid}: ${digits}`)
}

// ── Generate TwiML to connect agent ──
export const generateConnectTwiML = (callId: number, agentId?: number): string => {
  const VoiceResponse = twilio.twiml.VoiceResponse
  const response      = new VoiceResponse()

  if (agentId) {
    const dial = response.dial({ timeout: '30', record: 'record-from-answer' } as never)
    ;(dial as never as { conference: (name: string, attrs: object) => void })
      .conference(`agent-${agentId}`, {
        startConferenceOnEnter: true,
        endConferenceOnExit:    true,
        waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
      })
  } else {
    response.say({ voice: 'alice', language: 'en-US' },
      'Hello, please leave a message after the beep.')
    response.record({ maxLength: 30, playBeek: true } as never)
    response.hangup()
  }

  return response.toString()
}

// ── Generate TwiML for agent browser (softphone) ──
export const generateAgentTwiML = (agentId: number): string => {
  const VoiceResponse = twilio.twiml.VoiceResponse
  const response      = new VoiceResponse()
  const dial          = response.dial()

  ;(dial as never as { conference: (name: string, attrs: object) => void })
    .conference(`agent-${agentId}`, {
      startConferenceOnEnter: false,
      endConferenceOnExit:    true,
    })

  return response.toString()
}

// ── Whisper TwiML (supervisor listens silently) ──
export const generateWhisperTwiML = (conferenceRoom: string): string => {
  const VoiceResponse = twilio.twiml.VoiceResponse
  const response      = new VoiceResponse()
  const dial          = response.dial()

  ;(dial as never as { conference: (name: string, attrs: object) => void })
    .conference(conferenceRoom, {
      startConferenceOnEnter: false,
      endConferenceOnExit:    false,
      muted:                  true,
    })

  return response.toString()
}

// ── Generate Twilio Access Token ──
export const generateAccessToken = (agentId: number, _agentName: string): string => {
  const AccessToken = twilio.jwt.AccessToken
  const VoiceGrant  = AccessToken.VoiceGrant

  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_API_KEY     || process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_API_SECRET  || process.env.TWILIO_AUTH_TOKEN!,
    { identity: `agent_${agentId}` }
  )

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID || '',
    incomingAllow:          true,
  })

  token.addGrant(voiceGrant)
  return token.toJwt()
}

// ── Handle call status webhook ──
export const handleStatusWebhook = async (
  callId: number,
  data: { CallStatus: string; CallDuration?: string; CallSid: string }
) => {
  const statusMap: Record<string, string> = {
    initiated:      'INITIATED',
    ringing:        'RINGING',
    'in-progress':  'CONNECTED',
    completed:      'COMPLETED',
    busy:           'BUSY',
    'no-answer':    'NO_ANSWER',
    failed:         'FAILED',
    canceled:       'FAILED',
  }

  const status   = statusMap[data.CallStatus] || 'FAILED'
  const duration = data.CallDuration ? parseInt(data.CallDuration) : null

  await prisma.call.update({
    where: { id: callId },
    data: {
      status:      status as never,
      duration,
      endedAt:     ['COMPLETED','BUSY','NO_ANSWER','FAILED'].includes(status) ? new Date() : undefined,
      connectedAt: status === 'CONNECTED' ? new Date() : undefined,
    }
  })

  const call = await prisma.call.findUnique({
    where:  { id: callId },
    select: { contactId: true, contact: { select: { retryCount: true, campaignId: true } } }
  })

  if (!call) return

  const contactStatusMap: Record<string, string> = {
    COMPLETED: 'DONE',
    BUSY:      'BUSY',
    NO_ANSWER: 'NO_ANSWER',
    FAILED:    'NO_ANSWER',
    CONNECTED: 'ANSWERED',
  }

  const newContactStatus = contactStatusMap[status]
  if (newContactStatus) {
    await prisma.contact.update({
      where: { id: call.contactId },
      data:  { status: newContactStatus as never }
    })
  }

  logger.info(`📊 Call ${callId} status: ${status} (${duration}s)`)
}

// ── Handle recording webhook ──
export const handleRecordingWebhook = async (
  callId: number,
  data: { RecordingUrl: string; RecordingSid: string }
) => {
  await prisma.call.update({
    where: { id: callId },
    data:  { recordingUrl: data.RecordingUrl + '.mp3', recordingSid: data.RecordingSid }
  })
  logger.info(`🎙️ Recording saved for call ${callId}: ${data.RecordingSid}`)
}

// ── Handle AMD webhook ──
export const handleAMDWebhook = async (
  callId: number,
  data: { AnsweredBy: string }
) => {
  const isVoicemail = data.AnsweredBy === 'machine_start' ||
                      data.AnsweredBy === 'machine_end_beep'

  if (isVoicemail) {
    logger.info(`🤖 Voicemail detected for call ${callId} — hanging up`)
    const call = await prisma.call.findUnique({
      where:  { id: callId },
      select: { twilioCallSid: true }
    })
    if (call?.twilioCallSid) await hangupCall(call.twilioCallSid)
    await prisma.call.update({
      where: { id: callId },
      data:  { status: 'VOICEMAIL' as never }
    })
  }
}
