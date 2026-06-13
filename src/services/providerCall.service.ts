import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import logger from '../utils/logger'
import { resolveDynamicCallerIdForCall } from './dynamicCallerIdRuntime.service'
import { originateOutboundCall } from './asteriskAmi.service'

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

export const hangupCall = async (_providerCallId: string) => {
  logger.info('Provider hangup request acknowledged')
}

export const sendDTMF = async (_providerCallId: string, _digits: string) => {
  logger.info('Provider DTMF request acknowledged')
}
