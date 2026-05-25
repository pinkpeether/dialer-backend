import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { normalizeDialingMode, DIALING_MODES } from '../constants/dialingModes'
import * as TwilioService from './twilio.service'

const previewEligibleWhere = (campaignId: number) => {
  const now = new Date()
  return {
    campaignId,
    status: 'PENDING' as const,
    OR: [
      { nextRetryAt: null },
      { nextRetryAt: { lte: now } },
    ],
  }
}

export const getNextPreviewContact = async (campaignId: number, agentId: number) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const mode = normalizeDialingMode(campaign.mode)
  if (mode !== DIALING_MODES.PREVIEW) throw new AppError('Campaign is not in PREVIEW mode', 400)

  const contact = await prisma.$transaction(async (tx) => {
    const next = await tx.contact.findFirst({
      where: previewEligibleWhere(campaignId),
      orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
    })

    if (!next) return null

    return tx.contact.update({
      where: { id: next.id },
      data: { status: 'IN_QUEUE' },
    })
  })

  if (!contact) throw new AppError('No preview contacts available', 404)
  return { contact, agentId, campaignId }
}

export const releasePreviewContact = async (contactId: number, campaignId: number) => {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, campaignId } })
  if (!contact) throw new AppError('Preview contact not found', 404)

  if (contact.status !== 'IN_QUEUE') return contact

  return prisma.contact.update({
    where: { id: contact.id },
    data: { status: 'PENDING' },
  })
}

export const callPreviewContact = async (contactId: number, campaignId: number, agentId: number) => {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, campaignId } })
  if (!contact) throw new AppError('Preview contact not found', 404)

  if (contact.status !== 'IN_QUEUE' && contact.status !== 'PENDING') {
    throw new AppError(`Contact is not callable from preview state: ${contact.status}`, 400)
  }

  return TwilioService.initiateCall(contactId, campaignId, agentId)
}
