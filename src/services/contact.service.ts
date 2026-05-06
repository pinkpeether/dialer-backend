import { parse } from 'csv-parse/sync'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

// ── Phone number normalizer ──
const normalizePhone = (phone: string): string => {
  return phone.replace(/[\s\-\(\)\.]/g, '').trim()
}

// ── DNC check ──
const isDNC = async (phone: string): Promise<boolean> => {
  const entry = await prisma.dNCList.findUnique({
    where: { phone: normalizePhone(phone) }
  })
  return !!entry
}

export const getAllContacts = async (filters: {
  campaignId?: number
  status?: string
  search?: string
  page?: number
  limit?: number
}) => {
  const { campaignId, status, search, page = 1, limit = 50 } = filters

  const where: Record<string, unknown> = {}
  if (campaignId) where.campaignId = campaignId
  if (status)     where.status     = status
  if (search) {
    where.OR = [
      { name:    { contains: search, mode: 'insensitive' } },
      { phone:   { contains: search                      } },
      { email:   { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true, name: true, phone: true, email: true,
        company: true, status: true, retryCount: true,
        lastCalledAt: true, campaignId: true, createdAt: true,
        _count: { select: { calls: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.contact.count({ where }),
  ])

  return {
    contacts,
    pagination: {
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    }
  }
}

export const getContactById = async (id: number) => {
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      calls: {
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: {
          id: true, status: true, duration: true,
          disposition: true, sentiment: true,
          recordingUrl: true, startedAt: true, endedAt: true,
          agent: { select: { name: true, agentCode: true } }
        }
      },
      campaign: { select: { id: true, name: true } }
    }
  })
  if (!contact) throw new AppError('Contact not found', 404)
  return contact
}

export const createContact = async (data: {
  name: string
  phone: string
  email?: string
  company?: string
  notes?: string
  campaignId: number
}) => {
  // Check campaign exists
  const campaign = await prisma.campaign.findUnique({
    where: { id: data.campaignId }
  })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const phone = normalizePhone(data.phone)

  // DNC check
  if (await isDNC(phone)) {
    throw new AppError('This number is on the DNC list', 400)
  }

  // Duplicate check within same campaign
  const duplicate = await prisma.contact.findFirst({
    where: { phone, campaignId: data.campaignId }
  })
  if (duplicate) throw new AppError('Contact already exists in this campaign', 409)

  return await prisma.contact.create({
    data: { ...data, phone }
  })
}

export const updateContact = async (
  id: number,
  data: Partial<{
    name: string
    phone: string
    email: string
    company: string
    notes: string
    status: string
  }>
) => {
  const existing = await prisma.contact.findUnique({ where: { id } })
  if (!existing) throw new AppError('Contact not found', 404)

  if (data.phone) data.phone = normalizePhone(data.phone)

  return await prisma.contact.update({
  where: { id },
  data: data as any,
  })
}

export const deleteContact = async (id: number) => {
  const existing = await prisma.contact.findUnique({ where: { id } })
  if (!existing) throw new AppError('Contact not found', 404)
  await prisma.contact.delete({ where: { id } })
}

// ── CSV BULK UPLOAD ──
export const uploadCSV = async (
  campaignId: number,
  fileBuffer: Buffer
): Promise<{
  imported: number
  duplicates: number
  dncSkipped: number
  errors: number
  total: number
}> => {
  // Check campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId }
  })
  if (!campaign) throw new AppError('Campaign not found', 404)

  // Parse CSV
  let records: Record<string, string>[]
  try {
    records = parse(fileBuffer, {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
    })
  } catch {
    throw new AppError('Invalid CSV format', 400)
  }

  if (records.length === 0) {
    throw new AppError('CSV file is empty', 400)
  }

  // Get existing phones in this campaign
  const existingContacts = await prisma.contact.findMany({
    where:  { campaignId },
    select: { phone: true }
  })
  const existingPhones = new Set(existingContacts.map(c => c.phone))

  // Get all DNC numbers
  const dncList = await prisma.dNCList.findMany({ select: { phone: true } })
  const dncSet  = new Set(dncList.map(d => d.phone))

  let imported   = 0
  let duplicates = 0
  let dncSkipped = 0
  let errors     = 0

  const toInsert: {
    name: string
    phone: string
    email?: string
    company?: string
    notes?: string
    campaignId: number
    status: 'PENDING'
  }[] = []

  const seenInBatch = new Set<string>()

  for (const row of records) {
    try {
      // Support flexible column names
      const name    = row.name    || row.Name    || row.NAME    || 'Unknown'
      const rawPhone = row.phone  || row.Phone   || row.PHONE   ||
                       row.mobile || row.Mobile  || row.number  || row.Number || ''
      const email   = row.email   || row.Email   || ''
      const company = row.company || row.Company || ''
      const notes   = row.notes   || row.Notes   || ''

      if (!rawPhone) { errors++; continue }

      const phone = normalizePhone(rawPhone)
      if (!phone)   { errors++; continue }

      // DNC check
      if (dncSet.has(phone)) { dncSkipped++; continue }

      // Duplicate in DB
      if (existingPhones.has(phone)) { duplicates++; continue }

      // Duplicate in current batch
      if (seenInBatch.has(phone)) { duplicates++; continue }

      seenInBatch.add(phone)
      toInsert.push({
        name:       name.trim(),
        phone,
        email:      email   || undefined,
        company:    company || undefined,
        notes:      notes   || undefined,
        campaignId,
        status:     'PENDING',
      })
    } catch {
      errors++
    }
  }

  // Bulk insert in batches of 500
  const BATCH_SIZE = 500
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)
    await prisma.contact.createMany({ data: batch, skipDuplicates: true })
    imported += batch.length
  }

  return {
    imported,
    duplicates,
    dncSkipped,
    errors,
    total: records.length,
  }
}

export const addToDNC = async (phone: string, reason?: string) => {
  const normalized = normalizePhone(phone)
  return await prisma.dNCList.upsert({
    where:  { phone: normalized },
    update: { reason },
    create: { phone: normalized, reason },
  })
}

export const getContactStats = async (campaignId?: number) => {
  const where = campaignId ? { campaignId } : {}

  const [total, pending, calling, answered, noAnswer, busy, done, dnc] =
    await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.count({ where: { ...where, status: 'PENDING'   } }),
      prisma.contact.count({ where: { ...where, status: 'CALLING'   } }),
      prisma.contact.count({ where: { ...where, status: 'ANSWERED'  } }),
      prisma.contact.count({ where: { ...where, status: 'NO_ANSWER' } }),
      prisma.contact.count({ where: { ...where, status: 'BUSY'      } }),
      prisma.contact.count({ where: { ...where, status: 'DONE'      } }),
      prisma.contact.count({ where: { ...where, status: 'DNC'       } }),
    ])

  const dialed      = total - pending
  const answerRate  = dialed > 0
    ? Math.round(((answered + done) / dialed) * 100) : 0

  return {
    total, pending, calling, answered,
    noAnswer, busy, done, dnc,
    dialed, answerRate
  }
}