import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import logger from '../utils/logger'
import { resolveDynamicCallerIdForCall } from './dynamicCallerIdRuntime.service'
import { hangupBackendOriginatedCall, originateOutboundCall } from './asteriskAmi.service'

const DEFAULT_CALLER_ID = process.env.DEFAULT_OUTBOUND_CALLER_ID || ''

type Actor = { id: number; email?: string; role?: string }
type CallOptions = { callerIdId?: number | string | null; agentExtension?: string | null }

const sanitizeAgentExtension = (value?: string | null) => value ? value.replace(/[^0-9A-Za-z_.-]/g, '').trim() : ''

export const initiateCall = async (contactId: number, campaignId: number, actorOrAgentId?: Actor | number, options: CallOptions = {}) => {
  const actor = typeof actorOrAgentId === 'object' ? actorOrAgentId : undefined
  const agentId = typeof actorOrAgentId === 'number' ? actorOrAgentId : actorOrAgentId?.id
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) throw new AppError('Contact not found', 404)

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const dynamicCallerId = actor ? await resolveDynamicCallerIdForCall(actor, options.callerIdId) : null
  const outboundCallerId = dynamicCallerId || campaign.callerId || DEFAULT_CALLER_ID || null
  const agentExtension = sanitizeAgentExtension(options.agentExtension)

  const callRecord = await prisma.call.create({
    data: {
      contactId,
      campaignId,
      agentId: agentId || null,
      status: 'RINGING',
      direction: 'outgoing',
      remoteNumber: contact.phone,
      source: process.env.SIP_TRUNK_PROVIDER || 'sip_trunk',
      providerCallId: 'pending_ami_' + Date.now(),
      startedAt: new Date(),
    },
  })

  try {
    const originate = await originateOutboundCall({
      to: contact.phone,
      callerId: outboundCallerId,
      callId: callRecord.id,
      campaignId,
      agentId,
      agentExtension,
      dynamicCallerIdUsed: Boolean(dynamicCallerId),
    })
    const updatedCall = await prisma.call.update({ where: { id: callRecord.id }, data: { providerCallId: originate.providerCallId } })
    await prisma.contact.update({ where: { id: contactId }, data: { status: 'CALLING', lastCalledAt: new Date() } })
    logger.info(originate.enabled ? 'Asterisk AMI originate queued for campaign/contact call' : 'AMI disabled; provider placeholder created')
    return {
      callRecord: { ...updatedCall, callerId: outboundCallerId, dynamicCallerIdUsed: Boolean(dynamicCallerId), backendOriginate: originate.enabled, agentExtension },
      providerCall: { id: originate.providerCallId, to: contact.phone, from: outboundCallerId, backendOriginate: originate.enabled, agentExtension },
    }
  } catch (err) {
    await prisma.call.update({ where: { id: callRecord.id }, data: { status: 'FAILED', endedAt: new Date() } }).catch(() => undefined)
    throw err
  }
}

export const initiateAdhocCall = async (phone: string, actorOrAgentId: Actor | number, note?: string, options: CallOptions = {}) => {
  const actor = typeof actorOrAgentId === 'object' ? actorOrAgentId : undefined
  const agentId = typeof actorOrAgentId === 'number' ? actorOrAgentId : actorOrAgentId.id
  const contact = await prisma.contact.create({ data: { phone, name: note || 'Ad-hoc Call', status: 'CALLING', lastCalledAt: new Date() } })

  let campaign = await prisma.campaign.findFirst({ where: { name: '__adhoc__' } })
  if (!campaign) {
    campaign = await prisma.campaign.create({ data: { name: '__adhoc__', description: 'System campaign for ad-hoc manual calls', status: 'ACTIVE', callerId: DEFAULT_CALLER_ID, dialingRatio: 1 } })
  }

  const dynamicCallerId = actor ? await resolveDynamicCallerIdForCall(actor, options.callerIdId) : null
  const outboundCallerId = dynamicCallerId || DEFAULT_CALLER_ID || campaign.callerId || null
  const agentExtension = sanitizeAgentExtension(options.agentExtension)

  const callRecord = await prisma.call.create({
    data: {
      contactId: contact.id,
      campaignId: campaign.id,
      agentId,
      status: 'RINGING',
      direction: 'outgoing',
      remoteNumber: phone,
      source: process.env.SIP_TRUNK_PROVIDER || 'sip_trunk',
      providerCallId: 'pending_ami_' + Date.now(),
      startedAt: new Date(),
    },
  })

  try {
    const originate = await originateOutboundCall({
      to: phone,
      callerId: outboundCallerId,
      callId: callRecord.id,
      campaignId: campaign.id,
      agentId,
      agentExtension,
      dynamicCallerIdUsed: Boolean(dynamicCallerId),
    })
    const updatedCall = await prisma.call.update({ where: { id: callRecord.id }, data: { providerCallId: originate.providerCallId } })
    logger.info(originate.enabled ? 'Asterisk AMI originate queued for ad-hoc call' : 'AMI disabled; ad-hoc provider placeholder created')
    return { callSid: originate.providerCallId, callId: updatedCall.id, contactId: contact.id, phone, providerCallId: originate.providerCallId, callerId: outboundCallerId, dynamicCallerIdUsed: Boolean(dynamicCallerId), backendOriginate: originate.enabled, agentExtension }
  } catch (err) {
    await prisma.call.update({ where: { id: callRecord.id }, data: { status: 'FAILED', endedAt: new Date() } }).catch(() => undefined)
    throw err
  }
}

export const hangupBackendOriginated = async (input: { callId?: number | string | null; providerCallId?: string | null; phone?: string | null; agentExtension?: string | null }) => {
  const callId = input.callId ? Number(input.callId) : null
  const callRecord = callId && Number.isInteger(callId)
    ? await prisma.call.findUnique({ where: { id: callId } }).catch(() => null)
    : input.providerCallId
      ? await prisma.call.findFirst({ where: { providerCallId: String(input.providerCallId) } }).catch(() => null)
      : null

  const result = await hangupBackendOriginatedCall({
    callId: callRecord?.id || input.callId,
    providerCallId: callRecord?.providerCallId || input.providerCallId,
    phone: input.phone || callRecord?.remoteNumber || null,
    agentExtension: input.agentExtension || null,
  })

  if (callRecord?.id) {
    const endedAt = new Date()
    const fullCallRecord = await prisma.call.findUnique({
      where: { id: callRecord.id },
      select: {
        id: true,
        startedAt: true,
        connectedAt: true,
        duration: true,
      },
    }).catch(() => null)

    const durationStart = fullCallRecord?.connectedAt || fullCallRecord?.startedAt
    const computedDuration = durationStart
      ? Math.max(0, Math.round((endedAt.getTime() - durationStart.getTime()) / 1000))
      : 0

    await prisma.call.update({
      where: { id: callRecord.id },
      data: {
        endedAt,
        duration: fullCallRecord?.duration && fullCallRecord.duration > 0 ? fullCallRecord.duration : computedDuration,
        status: computedDuration > 0 ? 'COMPLETED' : 'NO_ANSWER',
      },
    }).catch(() => undefined)
  }

  logger.info('Backend-originated PTDT-Dialer hangup requested')
  return result
}

export const hangupCall = async (providerCallId: string) => {
  return hangupBackendOriginated({ providerCallId })
}

export const sendDTMF = async (_providerCallId: string, _digits: string) => {
  logger.info('Provider DTMF request acknowledged')
}
