import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

const TAGS_PATTERN = /\[PTDT_TAGS:([^\]]*)\]/
const TAGS_PREFIX = '[PTDT_TAGS:'

type ContactImportRow = {
  name?: string
  phone?: string
  email?: string
  company?: string
  notes?: string
}

type ExportFilters = {
  campaignId?: number
  status?: string
  tag?: string
  search?: string
}

const normalizePhone = (phone: string | null | undefined) => String(phone || '').replace(/\D/g, '')

const normalizeTag = (tag: string) => tag.trim().toLowerCase().replace(/\s+/g, '-')

const parseTagsFromNotes = (notes?: string | null): string[] => {
  const match = String(notes || '').match(TAGS_PATTERN)
  if (!match?.[1]) return []
  return match[1]
    .split(',')
    .map(t => normalizeTag(t))
    .filter(Boolean)
}

const stripTagMetadata = (notes?: string | null): string => {
  return String(notes || '').replace(TAGS_PATTERN, '').trim()
}

const buildNotesWithTags = (notes: string | null | undefined, tags: string[]) => {
  const cleanNotes = stripTagMetadata(notes)
  const cleanTags = Array.from(new Set(tags.map(normalizeTag).filter(Boolean)))
  if (cleanTags.length === 0) return cleanNotes || null
  return `${cleanNotes}${cleanNotes ? '\n\n' : ''}${TAGS_PREFIX}${cleanTags.join(',')}]`
}

const csvEscape = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export const getDuplicateContacts = async () => {
  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      company: true,
      status: true,
      campaignId: true,
      createdAt: true,
      lastCalledAt: true,
      notes: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const groups = contacts.reduce<Record<string, typeof contacts>>((acc, contact) => {
    const normalized = normalizePhone(contact.phone)
    if (normalized.length < 7) return acc
    acc[normalized] ??= []
    acc[normalized].push(contact)
    return acc
  }, {})

  const duplicates = Object.entries(groups)
    .filter(([, rows]) => rows.length > 1)
    .map(([normalizedPhone, rows]) => ({
      normalizedPhone,
      count: rows.length,
      suggestedPrimaryId: rows[0]?.id || null,
      contacts: rows.map(row => ({
        ...row,
        tags: parseTagsFromNotes(row.notes),
        notes: stripTagMetadata(row.notes),
      })),
    }))
    .sort((a, b) => b.count - a.count)

  return {
    generatedAt: new Date().toISOString(),
    duplicateGroups: duplicates,
    duplicateGroupCount: duplicates.length,
    duplicateContactCount: duplicates.reduce((sum, group) => sum + group.count, 0),
  }
}

export const getContactTimeline = async (contactId: number) => {
  if (!Number.isFinite(contactId)) throw new AppError('Invalid contact id', 400)

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      campaign: { select: { id: true, name: true, status: true } },
      calls: {
        orderBy: { startedAt: 'desc' },
        include: {
          campaign: { select: { id: true, name: true } },
          agent: { select: { id: true, name: true, email: true, agentCode: true } },
        },
      },
      callbacks: {
        orderBy: { scheduledAt: 'desc' },
        include: {
          agent: { select: { id: true, name: true, email: true, agentCode: true } },
        },
      },
    },
  })

  if (!contact) throw new AppError('Contact not found', 404)

  const callEvents = contact.calls.map(call => ({
    type: 'CALL',
    occurredAt: call.startedAt,
    title: `Call ${call.status}`,
    description: call.disposition ? `Disposition: ${call.disposition}` : call.notes || 'Call activity',
    metadata: {
      callId: call.id,
      campaignId: call.campaignId,
      campaignName: call.campaign?.name,
      agent: call.agent,
      duration: call.duration,
      recordingUrl: call.recordingUrl,
      source: call.source,
      remoteNumber: call.remoteNumber,
      endedAt: call.endedAt,
    },
  }))

  const callbackEvents = contact.callbacks.map(callback => ({
    type: 'CALLBACK',
    occurredAt: callback.scheduledAt,
    title: `Callback ${callback.status}`,
    description: callback.notes || 'Callback scheduled',
    metadata: {
      callbackId: callback.id,
      agent: callback.agent,
      callId: callback.callId,
      createdAt: callback.createdAt,
    },
  }))

  const contactEvents = [
    {
      type: 'CONTACT_CREATED',
      occurredAt: contact.createdAt,
      title: 'Contact created',
      description: contact.notes ? stripTagMetadata(contact.notes) : 'Contact entered the system',
      metadata: { status: contact.status, campaignId: contact.campaignId },
    },
  ]

  const timeline = [...callEvents, ...callbackEvents, ...contactEvents]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  return {
    contact: {
      ...contact,
      notes: stripTagMetadata(contact.notes),
      tags: parseTagsFromNotes(contact.notes),
    },
    timeline,
    stats: {
      totalCalls: contact.calls.length,
      totalCallbacks: contact.callbacks.length,
      lastCalledAt: contact.lastCalledAt,
      retryCount: contact.retryCount,
    },
  }
}

export const updateContactNotes = async (contactId: number, notes: string) => {
  if (!Number.isFinite(contactId)) throw new AppError('Invalid contact id', 400)
  const existing = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!existing) throw new AppError('Contact not found', 404)

  const tags = parseTagsFromNotes(existing.notes)
  const contact = await prisma.contact.update({
    where: { id: contactId },
    data: { notes: buildNotesWithTags(notes, tags) },
  })

  return {
    ...contact,
    notes: stripTagMetadata(contact.notes),
    tags: parseTagsFromNotes(contact.notes),
  }
}

export const updateContactTags = async (contactId: number, tags: string[]) => {
  if (!Number.isFinite(contactId)) throw new AppError('Invalid contact id', 400)
  const existing = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!existing) throw new AppError('Contact not found', 404)

  const contact = await prisma.contact.update({
    where: { id: contactId },
    data: { notes: buildNotesWithTags(existing.notes, tags) },
  })

  return {
    ...contact,
    notes: stripTagMetadata(contact.notes),
    tags: parseTagsFromNotes(contact.notes),
  }
}

export const previewContactImport = async (rows: ContactImportRow[], campaignId?: number) => {
  if (!Array.isArray(rows)) throw new AppError('contacts array is required', 400)

  const campaign = campaignId
    ? await prisma.campaign.findUnique({ where: { id: campaignId } })
    : null
  if (campaignId && !campaign) throw new AppError('Campaign not found', 404)

  const normalizedRows = rows.map((row, index) => ({
    index,
    name: String(row.name || '').trim(),
    phone: String(row.phone || '').trim(),
    normalizedPhone: normalizePhone(row.phone),
    email: String(row.email || '').trim(),
    company: String(row.company || '').trim(),
    notes: String(row.notes || '').trim(),
  }))

  const validPhones = normalizedRows
    .filter(row => row.normalizedPhone.length >= 7)
    .map(row => row.normalizedPhone)

  const existingContacts = validPhones.length > 0
    ? await prisma.contact.findMany({
        where: { phone: { in: Array.from(new Set(normalizedRows.map(row => row.phone).filter(Boolean))) } },
        select: { id: true, phone: true, campaignId: true, status: true },
      })
    : []

  const dncEntries = validPhones.length > 0
    ? await prisma.dNCList.findMany({
        select: { phone: true, reason: true },
      })
    : []

  const existingByNormalized = new Map(existingContacts.map(contact => [normalizePhone(contact.phone), contact]))
  const dncByNormalized = new Map(dncEntries.map(entry => [normalizePhone(entry.phone), entry]))
  const batchSeen = new Set<string>()

  const preview = normalizedRows.map(row => {
    const errors: string[] = []
    const warnings: string[] = []

    if (!row.phone) errors.push('Missing phone number')
    if (row.phone && row.normalizedPhone.length < 7) errors.push('Invalid phone number')
    if (batchSeen.has(row.normalizedPhone)) warnings.push('Duplicate in uploaded file')
    if (existingByNormalized.has(row.normalizedPhone)) warnings.push('Duplicate existing contact')
    if (dncByNormalized.has(row.normalizedPhone)) warnings.push('Number exists in DNC list')

    if (row.normalizedPhone) batchSeen.add(row.normalizedPhone)

    return {
      ...row,
      importable: errors.length === 0 && !dncByNormalized.has(row.normalizedPhone),
      errors,
      warnings,
      existingContact: existingByNormalized.get(row.normalizedPhone) || null,
      dnc: dncByNormalized.get(row.normalizedPhone) || null,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
    totals: {
      submitted: preview.length,
      importable: preview.filter(row => row.importable).length,
      invalid: preview.filter(row => row.errors.length > 0).length,
      duplicates: preview.filter(row => row.warnings.some(w => w.includes('Duplicate'))).length,
      dncBlocked: preview.filter(row => row.dnc).length,
    },
    rows: preview,
  }
}

export const exportContactsCsv = async (filters: ExportFilters) => {
  const where: Record<string, unknown> = {}
  if (filters.campaignId && Number.isFinite(filters.campaignId)) where.campaignId = filters.campaignId
  if (filters.status) where.status = String(filters.status).toUpperCase()
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { company: { contains: filters.search, mode: 'insensitive' } },
    ]
  }

  const contacts = await prisma.contact.findMany({
    where,
    include: {
      campaign: { select: { id: true, name: true } },
      calls: { select: { id: true }, take: 1 },
      callbacks: { select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  })

  const filtered = filters.tag
    ? contacts.filter(contact => parseTagsFromNotes(contact.notes).includes(normalizeTag(String(filters.tag))))
    : contacts

  const header = [
    'ID', 'Name', 'Phone', 'Email', 'Company', 'Status', 'Campaign ID', 'Campaign Name',
    'Tags', 'Notes', 'Retry Count', 'Last Called At', 'Next Retry At', 'Created At'
  ]

  const rows = filtered.map(contact => [
    contact.id,
    contact.name,
    contact.phone,
    contact.email,
    contact.company,
    contact.status,
    contact.campaignId,
    contact.campaign?.name || '',
    parseTagsFromNotes(contact.notes).join('|'),
    stripTagMetadata(contact.notes),
    contact.retryCount,
    contact.lastCalledAt?.toISOString() || '',
    contact.nextRetryAt?.toISOString() || '',
    contact.createdAt.toISOString(),
  ])

  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n')
}
