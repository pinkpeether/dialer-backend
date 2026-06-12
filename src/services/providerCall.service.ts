import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import logger from '../utils/logger'
import { resolveDynamicCallerIdForCall } from './dynamicCallerIdRuntime.service'

const DEFAULT_CALLER_ID = process.env.DEFAULT_OUTBOUND_CALLER_ID || ''

type Actor = { id: number; email?: string; role?: string }
type CallOptions = { callerIdId?: number | string | null }

const buildProviderCallId = () => 'provider_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)

export const initiateCall = async (contactId: number, campaignId: number, actorOrAgentId?: Actor | number, options: CallOptions = {}) => {
  const actor = typeof actorOrAgentId === 'object' ? actorOrAgentId : undefined
  const agentId = typeof actorOrAgentId === 'number' ? actorOrAgentId : actorOrAgentId?.id
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) throw new AppError('Contact not found', 404)

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const dynamicCallerId = actor ? await resolveDynamicCallerIdForCall(actor, options.callerIdId) : null
  const outboundCallerId = dynamicCallerId || campaign.callerId || DEFAULT_CALLER_ID || null
  const providerCallId = buildProviderCallId()

  const callRecord = await prisma.call.create({
    data: {
      contactId,
      campaignId,
      agentId: agentId || null,
      status: 'RINGING',
      direction: 'outgoing',
      remoteNumber: contact.phone,
      source: process.env.SIP_TRUNK_PROVIDER || 'sip_trunk',
      providerCallId,
      startedAt: new Date(),
    },
  })

  await prisma.contact.update({ where: { id: contactId }, data: { status: 'CALLING', lastCalledAt: new Date() } })

  logger.info('Provider call placeholder created with Dynamic Caller ID validation')
  return {
    callRecord: { ...callRecord, providerCallId, callerId: outboundCallerId, dynamicCallerIdUsed: Boolean(dynamicCallerId) },
    providerCall: { id: providerCallId, to: contact.phone, from: outboundCallerId },
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
  const providerCallId = buildProviderCallId()

  const callRecord = await prisma.call.create({
    data: {
      contactId: contact.id,
      campaignId: campaign.id,
      agentId,
      status: 'RINGING',
      direction: 'outgoing',
      remoteNumber: phone,
      source: process.env.SIP_TRUNK_PROVIDER || 'sip_trunk',
      providerCallId,
      startedAt: new Date(),
    },
  })

  logger.info('Ad-hoc provider call placeholder created with Dynamic Caller ID validation')
  return { callSid: providerCallId, callId: callRecord.id, contactId: contact.id, phone, providerCallId, callerId: outboundCallerId, dynamicCallerIdUsed: Boolean(dynamicCallerId) }
}

export const hangupCall = async (_providerCallId: string) => {
  logger.info('Provider hangup request acknowledged')
}

export const sendDTMF = async (_providerCallId: string, _digits: string) => {
  logger.info('Provider DTMF request acknowledged')
}
