import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import logger from '../utils/logger'

const DEFAULT_CALLER_ID = process.env.DEFAULT_OUTBOUND_CALLER_ID || ''

const buildProviderCallId = () => `provider_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export const initiateCall = async (contactId: number, campaignId: number, agentId?: number) => {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) throw new AppError('Contact not found', 404)

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

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

  await prisma.contact.update({
    where: { id: contactId },
    data: { status: 'CALLING', lastCalledAt: new Date() },
  })

  logger.info(`Provider call placeholder created: ${providerCallId} -> ${contact.phone}`)
  return {
    callRecord: { ...callRecord, providerCallId },
    providerCall: { id: providerCallId, to: contact.phone, from: campaign.callerId || DEFAULT_CALLER_ID || null },
  }
}

export const initiateAdhocCall = async (phone: string, agentId: number, note?: string) => {
  const contact = await prisma.contact.create({
    data: {
      phone,
      name: note || 'Ad-hoc Call',
      status: 'CALLING',
      lastCalledAt: new Date(),
    },
  })

  let campaign = await prisma.campaign.findFirst({ where: { name: '__adhoc__' } })
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        name: '__adhoc__',
        description: 'System campaign for ad-hoc manual calls',
        status: 'ACTIVE',
        callerId: DEFAULT_CALLER_ID,
        dialingRatio: 1,
      },
    })
  }

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

  logger.info(`Ad-hoc provider call placeholder created: ${providerCallId} -> ${phone}`)
  return { callSid: providerCallId, callId: callRecord.id, contactId: contact.id, phone, providerCallId }
}

export const hangupCall = async (_providerCallId: string) => {
  logger.info('Provider hangup request acknowledged')
}

export const sendDTMF = async (_providerCallId: string, _digits: string) => {
  logger.info('Provider DTMF request acknowledged')
}
