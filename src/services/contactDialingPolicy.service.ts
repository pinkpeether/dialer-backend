import prisma from '../lib/prisma'

export type EligibleDialingContact = {
  id: number
  phone: string
  retryCount: number
  maxRetries: number
  status: string
  nextRetryAt: Date | null
  createdAt: Date
}

const FINAL_CONTACT_STATUSES = ['ANSWERED', 'CONTACTED', 'DONE', 'DNC', 'WRONG_NUMBER', 'CALLING', 'IN_QUEUE']
const RETRYABLE_CONTACT_STATUSES = ['PENDING', 'NO_ANSWER', 'BUSY', 'FAILED', 'VOICEMAIL']

const normalizePhone = (value: string) => String(value || '').replace(/[^+\d]/g, '')

export const getDncPhoneSet = async (phones: string[]) => {
  const normalizedPhones = Array.from(new Set(phones.map(normalizePhone).filter(Boolean)))
  if (normalizedPhones.length === 0) return new Set<string>()

  const dncRows = await prisma.dNCList.findMany({
    where: { phone: { in: normalizedPhones } },
    select: { phone: true },
  })

  return new Set(dncRows.map(row => normalizePhone(row.phone)))
}

export const markDncContacts = async (contactIds: number[]) => {
  if (contactIds.length === 0) return 0
  const result = await prisma.contact.updateMany({
    where: { id: { in: contactIds } },
    data: {
      status: 'DNC',
      lastDisposition: 'DO_NOT_CALL',
      updatedAt: new Date(),
    },
  })
  return result.count
}

export const getEligibleCampaignContacts = async (campaignId: number, take: number, now = new Date()) => {
  const safeTake = Math.max(1, Math.min(Math.floor(take || 1), 100))

  const candidates = await prisma.contact.findMany({
    where: {
      campaignId,
      status: { in: RETRYABLE_CONTACT_STATUSES as never },
      OR: [
        { status: 'PENDING' as never },
        { nextRetryAt: null },
        { nextRetryAt: { lte: now } },
      ],
      NOT: { status: { in: FINAL_CONTACT_STATUSES as never } },
    },
    select: {
      id: true,
      phone: true,
      retryCount: true,
      maxRetries: true,
      status: true,
      nextRetryAt: true,
      createdAt: true,
    },
    orderBy: [
      { nextRetryAt: 'asc' },
      { createdAt: 'asc' },
    ],
    take: safeTake * 3,
  })

  const dncPhones = await getDncPhoneSet(candidates.map(contact => contact.phone))
  const dncContactIds: number[] = []
  const eligible: EligibleDialingContact[] = []

  for (const contact of candidates.filter(contact => contact.retryCount < contact.maxRetries)) {
    if (dncPhones.has(normalizePhone(contact.phone))) {
      dncContactIds.push(contact.id)
      continue
    }
    eligible.push(contact)
    if (eligible.length >= safeTake) break
  }

  const dncBlocked = await markDncContacts(dncContactIds)

  return {
    contacts: eligible,
    dncBlocked,
    inspected: candidates.length,
  }
}

export const getRetryDueCount = async (campaignId: number, now = new Date()) => {
  const contacts = await prisma.contact.findMany({
    where: {
      campaignId,
      status: { in: ['NO_ANSWER', 'BUSY', 'FAILED', 'VOICEMAIL'] as never },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    select: { retryCount: true, maxRetries: true },
  })
  return contacts.filter(contact => contact.retryCount < contact.maxRetries).length
}

export const scheduleContactRetry = async (contactId: number, retryDelaySeconds: number, disposition = 'NO_ANSWER') => {
  const retryDelay = Math.max(30, Math.floor(retryDelaySeconds || 300))
  const nextRetryAt = new Date(Date.now() + retryDelay * 1000)

  return prisma.contact.update({
    where: { id: contactId },
    data: {
      status: disposition === 'BUSY' ? 'BUSY' : 'NO_ANSWER',
      retryCount: { increment: 1 },
      nextRetryAt,
      lastDisposition: disposition,
      updatedAt: new Date(),
    },
  })
}
