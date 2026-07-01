import { parse } from 'csv-parse/sync'
import type { ContactStatus, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import * as Scope from './commercialScope.service'

type Actor = Scope.ScopeActor

const commercialAccountSelect = { id: true, name: true, code: true, status: true } as const

// ── Phone number normalizer ──
const normalizePhone = (phone: string): string => phone.replace(/[\s\-\(\)\.]/g, '').trim()

// ── DNC check ──
const isDNC = async (phone: string): Promise<boolean> => {
  const entry = await prisma.dNCList.findUnique({ where: { phone: normalizePhone(phone) } })
  return !!entry
}

export const getAllContacts = async (filters: { campaignId?: number; commercialAccountId?: number; status?: string; search?: string; page?: number; limit?: number }, actor?: Actor) => {
  const { campaignId, commercialAccountId, status, search, page = 1, limit = 50 } = filters
  const where: Prisma.ContactWhereInput = await Scope.contactScopeWhere(actor)
  if (campaignId) where.campaignId = campaignId
  if (commercialAccountId) where.campaign = { commercialAccountId }
  if (status) where.status = status as ContactStatus
  if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }, { email: { contains: search, mode: 'insensitive' } }, { company: { contains: search, mode: 'insensitive' } }]

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true, name: true, phone: true, email: true, company: true, status: true, retryCount: true, lastCalledAt: true, campaignId: true, createdAt: true,
        campaign: { select: { id: true, name: true, commercialAccount: { select: commercialAccountSelect } } },
        _count: { select: { calls: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ])

  return { contacts: contacts.map(contact => ({ ...contact, commercialAccount: contact.campaign?.commercialAccount || null })), pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }
}

export const getContactById = async (id: number, actor?: Actor) => {
  const contact = await prisma.contact.findFirst({
    where: { id, ...(await Scope.contactScopeWhere(actor)) },
    include: {
      calls: { orderBy: { startedAt: 'desc' }, take: 20, select: { id: true, status: true, duration: true, disposition: true, recordingUrl: true, startedAt: true, endedAt: true, agent: { select: { name: true, agentCode: true } } } },
      campaign: { select: { id: true, name: true, commercialAccount: { select: commercialAccountSelect } } },
    },
  })
  if (!contact) throw new AppError('Contact not found', 404)
  return { ...contact, commercialAccount: contact.campaign?.commercialAccount || null }
}

export const createContact = async (data: { name: string; phone: string; email?: string; company?: string; notes?: string; campaignId: number }, actor?: Actor) => {
  await Scope.assertCampaignAccess(data.campaignId, actor)
  const campaign = await prisma.campaign.findUnique({ where: { id: data.campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)
  const phone = normalizePhone(data.phone)
  if (await isDNC(phone)) throw new AppError('This number is on the DNC list', 400)
  const duplicate = await prisma.contact.findFirst({ where: { phone, campaignId: data.campaignId } })
  if (duplicate) throw new AppError('Contact already exists in this campaign', 409)
  return prisma.contact.create({ data: { ...data, phone } })
}

export const updateContact = async (id: number, data: Partial<{ name: string; phone: string; email: string; company: string; notes: string; status: string }>, actor?: Actor) => {
  await Scope.assertContactAccess(id, actor)
  const existing = await prisma.contact.findUnique({ where: { id } })
  if (!existing) throw new AppError('Contact not found', 404)
  if (data.phone) data.phone = normalizePhone(data.phone)
  return prisma.contact.update({ where: { id }, data: data as any })
}

export const deleteContact = async (id: number, actor?: Actor) => {
  await Scope.assertContactAccess(id, actor)
  const existing = await prisma.contact.findUnique({ where: { id } })
  if (!existing) throw new AppError('Contact not found', 404)
  await prisma.contact.delete({ where: { id } })
}

// ── CSV BULK UPLOAD ──
export const uploadCSV = async (campaignId: number, fileBuffer: Buffer, actor?: Actor): Promise<{ imported: number; duplicates: number; dncSkipped: number; errors: number; total: number }> => {
  await Scope.assertCampaignAccess(campaignId, actor)
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  let records: Record<string, string>[]
  try { records = parse(fileBuffer, { columns: true, skip_empty_lines: true, trim: true }) }
  catch { throw new AppError('Invalid CSV format', 400) }
  if (records.length === 0) throw new AppError('CSV file is empty', 400)

  const existingContacts = await prisma.contact.findMany({ where: { campaignId }, select: { phone: true } })
  const existingPhones = new Set(existingContacts.map(c => c.phone))
  const dncList = await prisma.dNCList.findMany({ select: { phone: true } })
  const dncSet = new Set(dncList.map(d => d.phone))
  let imported = 0, duplicates = 0, dncSkipped = 0, errors = 0
  const toInsert: { name: string; phone: string; email?: string; company?: string; notes?: string; campaignId: number; status: 'PENDING' }[] = []
  const seenInBatch = new Set<string>()

  for (const row of records) {
    try {
      const name = row.name || row.Name || row.NAME || 'Unknown'
      const rawPhone = row.phone || row.Phone || row.PHONE || row.mobile || row.Mobile || row.number || row.Number || ''
      const email = row.email || row.Email || ''
      const company = row.company || row.Company || ''
      const notes = row.notes || row.Notes || ''
      if (!rawPhone) { errors++; continue }
      const phone = normalizePhone(rawPhone)
      if (!phone) { errors++; continue }
      if (dncSet.has(phone)) { dncSkipped++; continue }
      if (existingPhones.has(phone)) { duplicates++; continue }
      if (seenInBatch.has(phone)) { duplicates++; continue }
      seenInBatch.add(phone)
      toInsert.push({ name: name.trim(), phone, email: email || undefined, company: company || undefined, notes: notes || undefined, campaignId, status: 'PENDING' })
    } catch { errors++ }
  }

  const batchSize = 500
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize)
    const result = await prisma.contact.createMany({ data: batch, skipDuplicates: true })
    imported += result.count
  }

  return { imported, duplicates, dncSkipped, errors, total: records.length }
}

export const addToDNC = async (phone: string, reason?: string) => prisma.dNCList.create({ data: { phone: normalizePhone(phone), reason: reason || 'Manual add' } })

export const getContactStats = async (campaignId?: number, actor?: Actor) => {
  const where: Prisma.ContactWhereInput = await Scope.contactScopeWhere(actor)
  if (campaignId) where.campaignId = campaignId
  const grouped = await prisma.contact.groupBy({ by: ['status'], where, _count: { _all: true } })
  const counts = grouped.reduce<Record<string, number>>((acc, row) => { acc[row.status] = row._count._all; return acc }, {})
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const answered = (counts.ANSWERED || 0) + (counts.CONTACTED || 0) + (counts.DONE || 0)
  return { total, pending: counts.PENDING || 0, answered, noAnswer: (counts.NO_ANSWER || 0) + (counts.BUSY || 0) + (counts.VOICEMAIL || 0), dnc: counts.DNC || 0, answerRate: total > 0 ? Math.round((answered / total) * 100) : 0 }
}
