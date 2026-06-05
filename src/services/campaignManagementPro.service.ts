import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

const ALLOWED_MODES = ['MANUAL', 'PREVIEW', 'PROGRESSIVE', 'PREDICTIVE'] as const

type CampaignMode = typeof ALLOWED_MODES[number]

type ImportOptions = {
  fileName?: string
  mimeType?: string
  buffer: Buffer
  maxRetries?: number
  defaultStatus?: 'PENDING' | 'IN_QUEUE'
  skipDnc?: boolean
  skipDuplicates?: boolean
}

type ParsedContactRow = {
  name?: string | null
  phone: string
  email?: string | null
  company?: string | null
  notes?: string | null
}

type ScriptPopupInput = {
  contactId?: number
  callId?: number
  agentName?: string
  stage?: string
}

const normalizePhone = (value: unknown) => String(value || '').trim()
const cleanText = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

const normalizeMode = (value: unknown): CampaignMode => {
  const upper = String(value || 'PROGRESSIVE').toUpperCase()
  return ALLOWED_MODES.includes(upper as CampaignMode) ? upper as CampaignMode : 'PROGRESSIVE'
}

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.max(min, Math.min(max, Math.floor(numberValue)))
}

const escapePdfText = (value: string) => value
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')

const buildSimplePdf = (title: string, lines: string[]) => {
  const safeLines = [title, ...lines].slice(0, 46)
  const contentLines = [
    'BT',
    '/F1 18 Tf',
    '50 780 Td',
    `(${escapePdfText(safeLines[0] || 'PTDT Campaign Report')}) Tj`,
    '/F1 10 Tf',
    '0 -28 Td',
    ...safeLines.slice(1).flatMap(line => [`(${escapePdfText(line)}) Tj`, '0 -16 Td']),
    'ET',
  ]
  const content = contentLines.join('\n')
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream\nendobj\n`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += obj
  }
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'utf8')
}

const splitCsvLine = (line: string) => {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]
    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

const parseDelimitedText = (buffer: Buffer, delimiter?: string): ParsedContactRow[] => {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const detectedDelimiter = delimiter || (lines[0].includes('\t') ? '\t' : ',')
  const rawHeader = detectedDelimiter === ',' ? splitCsvLine(lines[0]) : lines[0].split(detectedDelimiter)
  const header = rawHeader.map(value => value.trim().toLowerCase())
  const hasHeader = header.some(value => ['phone', 'mobile', 'number', 'name', 'email', 'company', 'notes'].includes(value))

  const indexFor = (...names: string[]) => header.findIndex(value => names.includes(value))
  const phoneIndex = hasHeader ? indexFor('phone', 'mobile', 'number', 'phone number', 'mobile number') : 0
  const nameIndex = hasHeader ? indexFor('name', 'full name', 'customer name') : 1
  const emailIndex = hasHeader ? indexFor('email', 'email address') : 2
  const companyIndex = hasHeader ? indexFor('company', 'business', 'organization') : 3
  const notesIndex = hasHeader ? indexFor('notes', 'note', 'remarks') : 4

  const dataLines = hasHeader ? lines.slice(1) : lines
  return dataLines.map(line => {
    const values = detectedDelimiter === ',' ? splitCsvLine(line) : line.split(detectedDelimiter).map(value => value.trim())
    return {
      phone: normalizePhone(values[phoneIndex >= 0 ? phoneIndex : 0]),
      name: cleanText(values[nameIndex]),
      email: cleanText(values[emailIndex]),
      company: cleanText(values[companyIndex]),
      notes: cleanText(values[notesIndex]),
    }
  }).filter(row => row.phone.length > 0)
}

const parseXlsx = (buffer: Buffer): ParsedContactRow[] => {
  let xlsx: { read: (data: Buffer, options: object) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_json: (sheet: unknown, options: object) => Array<Record<string, unknown>> } }
  try {
    // Optional dependency. Install with: npm install xlsx
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    xlsx = require('xlsx')
  } catch (_err) {
    throw new AppError('XLSX parser is not installed. Run npm install xlsx or upload CSV/TSV.', 400)
  }

  const workbook = xlsx.read(buffer, { type: 'buffer' })
  const firstSheet = workbook.SheetNames[0]
  if (!firstSheet) return []
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' })

  return rows.map(row => ({
    phone: normalizePhone(row.phone ?? row.Phone ?? row.mobile ?? row.Mobile ?? row.number ?? row.Number),
    name: cleanText(row.name ?? row.Name ?? row.fullName ?? row['Full Name'] ?? row.customerName ?? row['Customer Name']),
    email: cleanText(row.email ?? row.Email),
    company: cleanText(row.company ?? row.Company),
    notes: cleanText(row.notes ?? row.Notes ?? row.remarks ?? row.Remarks),
  })).filter(row => row.phone.length > 0)
}

const parseImportFile = (options: ImportOptions): ParsedContactRow[] => {
  const name = String(options.fileName || '').toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsx(options.buffer)
  if (name.endsWith('.tsv')) return parseDelimitedText(options.buffer, '\t')
  return parseDelimitedText(options.buffer)
}

const fillScriptPlaceholders = (script: string, context: Record<string, string | number | null | undefined>) => {
  return script.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = context[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

const getContactStats = async (campaignId: number) => {
  const grouped = await prisma.contact.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  })
  const counts = grouped.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all
    return acc
  }, {})
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const answered = (counts.ANSWERED || 0) + (counts.CONTACTED || 0) + (counts.DONE || 0)
  const missed = (counts.NO_ANSWER || 0) + (counts.BUSY || 0) + (counts.VOICEMAIL || 0) + (counts.FAILED || 0)
  const pending = counts.PENDING || 0
  const dialed = Math.max(0, total - pending)
  return {
    total,
    pending,
    answered,
    missed,
    callback: counts.CALLBACK || 0,
    dnc: counts.DNC || 0,
    active: (counts.IN_QUEUE || 0) + (counts.CALLING || 0),
    answerRate: dialed > 0 ? Math.round((answered / dialed) * 100) : 0,
    counts,
  }
}

export const getCampaignManagementSummary = async (campaignId: number) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { _count: { select: { contacts: true, calls: true } } },
  })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const stats = await getContactStats(campaignId)
  return {
    campaign,
    stats,
    scriptAvailable: Boolean(campaign.script && campaign.script.trim()),
    supportedUploadTypes: ['csv', 'tsv', 'xlsx when optional xlsx package is installed'],
  }
}

export const getCampaignScript = async (campaignId: number) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)
  return {
    campaignId,
    campaignName: campaign.name,
    script: campaign.script || '',
    placeholders: ['{{name}}', '{{phone}}', '{{email}}', '{{company}}', '{{agentName}}', '{{campaignName}}', '{{stage}}'],
    updatedAt: campaign.updatedAt,
  }
}

export const updateCampaignScript = async (campaignId: number, script: string) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { script: String(script || '').trim() || null },
  })

  return {
    campaignId: updated.id,
    script: updated.script || '',
    updatedAt: updated.updatedAt,
  }
}

export const getAgentScriptPopup = async (campaignId: number, input: ScriptPopupInput) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const contact = input.contactId
    ? await prisma.contact.findUnique({ where: { id: input.contactId } })
    : input.callId
      ? (await prisma.call.findUnique({ where: { id: input.callId }, include: { contact: true } }))?.contact || null
      : null

  const baseScript = campaign.script || 'Hello {{name}}, this is {{agentName}} calling from PTDT regarding {{campaignName}}.'
  const renderedScript = fillScriptPlaceholders(baseScript, {
    name: contact?.name || 'Customer',
    phone: contact?.phone || '',
    email: contact?.email || '',
    company: contact?.company || '',
    agentName: input.agentName || 'Agent',
    campaignName: campaign.name,
    stage: input.stage || 'opening',
  })

  return {
    campaignId,
    campaignName: campaign.name,
    contact,
    stage: input.stage || 'opening',
    renderedScript,
    objectionTips: [
      'Acknowledge the customer first, then answer briefly.',
      'Use the callback scheduler if the customer is busy.',
      'Confirm consent before marking as interested or DNC.',
    ],
  }
}

export const cloneCampaignAdvanced = async (campaignId: number, options: { includeContacts?: boolean; resetContactStatuses?: boolean; name?: string }) => {
  const original = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { contacts: options.includeContacts ? true : false },
  })
  if (!original) throw new AppError('Campaign not found', 404)

  const cloneName = options.name?.trim() || `${original.name} (Copy)`
  const cloned = await prisma.campaign.create({
    data: {
      name: cloneName,
      description: original.description,
      status: 'DRAFT',
      callerId: original.callerId,
      dialingRatio: original.dialingRatio,
      maxRetries: original.maxRetries,
      retryDelay: original.retryDelay,
      script: original.script,
      startTime: original.startTime,
      endTime: original.endTime,
      timezone: original.timezone,
      mode: original.mode,
    },
  })

  let clonedContacts = 0
  if (options.includeContacts && 'contacts' in original && original.contacts.length > 0) {
    await prisma.contact.createMany({
      data: original.contacts.map(contact => ({
        campaignId: cloned.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
        notes: contact.notes,
        maxRetries: contact.maxRetries,
        retryCount: 0,
        status: options.resetContactStatuses === false ? contact.status : 'PENDING',
      })),
    })
    clonedContacts = original.contacts.length
  }

  return { clonedCampaign: cloned, clonedContacts }
}

export const importCampaignContacts = async (campaignId: number, options: ImportOptions) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const parsedRows = parseImportFile(options)
  if (parsedRows.length === 0) throw new AppError('No valid contacts found in uploaded file', 400)

  const existingContacts = options.skipDuplicates !== false
    ? await prisma.contact.findMany({ where: { campaignId }, select: { phone: true } })
    : []
  const existingPhones = new Set(existingContacts.map(contact => normalizePhone(contact.phone)))

  const dncEntries = options.skipDnc !== false
    ? await prisma.dNCList.findMany({ select: { phone: true } })
    : []
  const dncPhones = new Set(dncEntries.map(entry => normalizePhone(entry.phone)))

  const importedPhones = new Set<string>()
  const skipped: Array<{ phone: string; reason: string }> = []
  const created: Array<{ id: number; phone: string }> = []

  for (const row of parsedRows) {
    const phone = normalizePhone(row.phone)
    if (!phone) {
      skipped.push({ phone: '', reason: 'MISSING_PHONE' })
      continue
    }
    if (options.skipDuplicates !== false && (existingPhones.has(phone) || importedPhones.has(phone))) {
      skipped.push({ phone, reason: 'DUPLICATE' })
      continue
    }
    if (options.skipDnc !== false && dncPhones.has(phone)) {
      skipped.push({ phone, reason: 'DNC' })
      continue
    }

    const contact = await prisma.contact.create({
      data: {
        campaignId,
        phone,
        name: row.name || null,
        email: row.email || null,
        company: row.company || null,
        notes: row.notes || null,
        status: options.defaultStatus || 'PENDING',
        maxRetries: clampInt(options.maxRetries, campaign.maxRetries, 0, 20),
      },
      select: { id: true, phone: true },
    })
    importedPhones.add(phone)
    created.push(contact)
  }

  return {
    campaignId,
    totalRows: parsedRows.length,
    imported: created.length,
    skipped: skipped.length,
    skippedDetails: skipped.slice(0, 200),
    created: created.slice(0, 200),
  }
}

export const getDialSettings = async (campaignId: number) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)
  return {
    campaignId,
    mode: normalizeMode(campaign.mode),
    dialingRatio: campaign.dialingRatio,
    maxRetries: campaign.maxRetries,
    retryDelay: campaign.retryDelay,
    startTime: campaign.startTime,
    endTime: campaign.endTime,
    timezone: campaign.timezone,
    waitingReason: campaign.waitingReason,
    lastSchedulerCheckAt: campaign.lastSchedulerCheckAt,
  }
}

export const updateDialSettings = async (campaignId: number, data: Record<string, unknown>) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      mode: data.mode !== undefined ? normalizeMode(data.mode) : campaign.mode,
      dialingRatio: data.dialingRatio !== undefined ? clampInt(data.dialingRatio, campaign.dialingRatio, 1, 10) : campaign.dialingRatio,
      maxRetries: data.maxRetries !== undefined ? clampInt(data.maxRetries, campaign.maxRetries, 0, 20) : campaign.maxRetries,
      retryDelay: data.retryDelay !== undefined ? clampInt(data.retryDelay, campaign.retryDelay, 30, 86400) : campaign.retryDelay,
      startTime: data.startTime !== undefined ? cleanText(data.startTime) : campaign.startTime,
      endTime: data.endTime !== undefined ? cleanText(data.endTime) : campaign.endTime,
      timezone: data.timezone !== undefined ? String(data.timezone || 'Asia/Karachi') : campaign.timezone,
    },
  })

  return getDialSettings(updated.id)
}

export const buildEndOfCampaignPdfReport = async (campaignId: number) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new AppError('Campaign not found', 404)

  const stats = await getContactStats(campaignId)
  const callTotals = await prisma.call.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  })
  const dispositions = await prisma.call.groupBy({
    by: ['disposition'],
    where: { campaignId },
    _count: { _all: true },
  })

  const averageDuration = await prisma.call.aggregate({
    where: { campaignId, duration: { not: null } },
    _avg: { duration: true },
    _max: { duration: true },
    _min: { duration: true },
  })

  const statusLine = callTotals.map(row => `${row.status}:${row._count._all}`).join(', ') || 'No calls yet'
  const dispositionLine = dispositions.map(row => `${row.disposition || 'NONE'}:${row._count._all}`).join(', ') || 'No dispositions yet'

  const lines = [
    `Campaign: ${campaign.name}`,
    `Status: ${campaign.status}`,
    `Mode: ${campaign.mode || 'PROGRESSIVE'} | Dial Ratio: ${campaign.dialingRatio}`,
    `Timezone: ${campaign.timezone} | Window: ${campaign.startTime || 'Any'} - ${campaign.endTime || 'Any'}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `Total contacts: ${stats.total}`,
    `Pending: ${stats.pending}`,
    `Answered/Contacted: ${stats.answered}`,
    `Missed/Failed: ${stats.missed}`,
    `Callbacks: ${stats.callback}`,
    `DNC: ${stats.dnc}`,
    `Answer Rate: ${stats.answerRate}%`,
    '',
    `Call statuses: ${statusLine}`,
    `Dispositions: ${dispositionLine}`,
    `Avg duration: ${Math.round(averageDuration._avg.duration || 0)} sec`,
    `Min duration: ${averageDuration._min.duration || 0} sec`,
    `Max duration: ${averageDuration._max.duration || 0} sec`,
    '',
    'PTDT Dialer - End of Campaign Report',
  ]

  return {
    fileName: `ptdt-campaign-${campaignId}-report.pdf`,
    buffer: buildSimplePdf('PTDT Campaign Report', lines),
  }
}
