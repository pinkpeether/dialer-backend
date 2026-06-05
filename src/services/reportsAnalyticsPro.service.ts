import prisma from '../lib/prisma'

export type ReportRange = {
  from?: string
  to?: string
  campaignId?: number
  agentId?: number
}

type SafeNumberMap = Record<string, number>

type AgentSummary = {
  id: number
  name: string | null
  agentCode: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

const clampDate = (value: string | undefined, fallback: Date) => {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

const startOfDay = (date: Date) => {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

const endOfDay = (date: Date) => {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

const buildWhere = (range: ReportRange) => {
  const to = endOfDay(clampDate(range.to, new Date()))
  const from = startOfDay(clampDate(range.from, new Date(to.getTime() - 6 * DAY_MS)))

  const where: Record<string, unknown> = {
    startedAt: {
      gte: from,
      lte: to,
    },
  }

  if (Number.isFinite(range.campaignId) && Number(range.campaignId) > 0) {
    where.campaignId = Number(range.campaignId)
  }

  if (Number.isFinite(range.agentId) && Number(range.agentId) > 0) {
    where.agentId = Number(range.agentId)
  }

  return { where, from, to }
}

const pct = (value: number, total: number) => {
  if (!total) return 0
  return Math.round((value / total) * 10000) / 100
}

const average = (values: number[]) => {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, item) => sum + item, 0) / values.length)
}

const normalizeDisposition = (value: string | null | undefined) => String(value || 'UNKNOWN').toUpperCase()

const isAnsweredDisposition = (value: string | null | undefined) => {
  const normalized = normalizeDisposition(value)
  return ['ANSWERED', 'SALE', 'CONVERTED', 'CONTACTED', 'INTERESTED', 'CALLBACK'].includes(normalized)
}

const isConversionDisposition = (value: string | null | undefined) => {
  const normalized = normalizeDisposition(value)
  return ['SALE', 'CONVERTED', 'SUCCESS', 'WON'].includes(normalized)
}

const isMissedDisposition = (value: string | null | undefined, status?: string | null) => {
  const normalized = normalizeDisposition(value)
  const normalizedStatus = String(status || '').toUpperCase()
  return ['NO_ANSWER', 'BUSY', 'MISSED', 'FAILED', 'VOICEMAIL'].includes(normalized) || ['FAILED', 'NO_ANSWER'].includes(normalizedStatus)
}

const increment = (map: SafeNumberMap, key: string, by = 1) => {
  map[key] = (map[key] || 0) + by
}

const toYmd = (date: Date) => date.toISOString().slice(0, 10)

const escapePdfText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

const buildSimplePdf = (title: string, lines: string[]) => {
  const safeLines = [title, ...lines].slice(0, 42)
  const streamLines = safeLines.map((line, index) => {
    const size = index === 0 ? 18 : 10
    const y = 780 - index * 17
    return `BT /F1 ${size} Tf 50 ${y} Td (${escapePdfText(line).slice(0, 120)}) Tj ET`
  })
  const stream = streamLines.join('\n')

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
  ]

  let body = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body))
    body += `${object}\n`
  }

  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  offsets.slice(1).forEach(offset => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(body, 'utf8')
}

export const getOverview = async (range: ReportRange) => {
  const { where, from, to } = buildWhere(range)

  const calls = await prisma.call.findMany({
    where,
    select: {
      id: true,
      campaignId: true,
      agentId: true,
      status: true,
      disposition: true,
      duration: true,
      startedAt: true,
      endedAt: true,
      remoteNumber: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 5000,
  })

  const totalCalls = calls.length
  const answeredCalls = calls.filter(call => isAnsweredDisposition(call.disposition)).length
  const conversions = calls.filter(call => isConversionDisposition(call.disposition)).length
  const missedCalls = calls.filter(call => isMissedDisposition(call.disposition, call.status)).length
  const durations = calls.map(call => Number(call.duration || 0)).filter(value => value > 0)

  const dispositions = calls.reduce<SafeNumberMap>((acc, call) => {
    increment(acc, normalizeDisposition(call.disposition))
    return acc
  }, {})

  return {
    generatedAt: new Date().toISOString(),
    range: { from: from.toISOString(), to: to.toISOString() },
    filters: {
      campaignId: range.campaignId || null,
      agentId: range.agentId || null,
    },
    kpis: {
      totalCalls,
      answeredCalls,
      missedCalls,
      conversions,
      answerRate: pct(answeredCalls, totalCalls),
      conversionRate: pct(conversions, totalCalls),
      missedRate: pct(missedCalls, totalCalls),
      averageDurationSeconds: average(durations),
      minDurationSeconds: durations.length ? Math.min(...durations) : 0,
      maxDurationSeconds: durations.length ? Math.max(...durations) : 0,
    },
    dispositions,
    recentCalls: calls.slice(0, 30),
  }
}

export const getAgentPerformance = async (range: ReportRange & { period?: string }) => {
  const { where, from, to } = buildWhere(range)

  const calls = await prisma.call.findMany({
    where,
    select: {
      id: true,
      agentId: true,
      status: true,
      disposition: true,
      duration: true,
      startedAt: true,
    },
    take: 5000,
  })

  const agentIds = Array.from(new Set(calls.map(call => call.agentId).filter((id): id is number => typeof id === 'number')))
  const agents = agentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true, agentCode: true },
      })
    : []

  const agentMap = agents.reduce<Record<number, AgentSummary>>((acc, agent) => {
    acc[agent.id] = agent
    return acc
  }, {})

  const byAgent = calls.reduce<Record<number, typeof calls>>((acc, call) => {
    if (!call.agentId) return acc
    acc[call.agentId] ??= []
    acc[call.agentId].push(call)
    return acc
  }, {})

  const report = Object.entries(byAgent).map(([id, rows]) => {
    const agentId = Number(id)
    const durations = rows.map(row => Number(row.duration || 0)).filter(value => value > 0)
    const answered = rows.filter(row => isAnsweredDisposition(row.disposition)).length
    const conversions = rows.filter(row => isConversionDisposition(row.disposition)).length
    const missed = rows.filter(row => isMissedDisposition(row.disposition, row.status)).length

    return {
      agentId,
      name: agentMap[agentId]?.name || `Agent #${agentId}`,
      agentCode: agentMap[agentId]?.agentCode || null,
      totalCalls: rows.length,
      answeredCalls: answered,
      missedCalls: missed,
      conversions,
      answerRate: pct(answered, rows.length),
      conversionRate: pct(conversions, rows.length),
      averageDurationSeconds: average(durations),
      talkTimeSeconds: durations.reduce((sum, value) => sum + value, 0),
      score: Math.round(answered * 3 + conversions * 10 + average(durations) / 60),
    }
  }).sort((a, b) => b.score - a.score)

  return {
    generatedAt: new Date().toISOString(),
    period: range.period || 'custom',
    range: { from: from.toISOString(), to: to.toISOString() },
    agents: report,
  }
}

export const getHourlyAnalytics = async (range: ReportRange) => {
  const { where, from, to } = buildWhere(range)
  const calls = await prisma.call.findMany({
    where,
    select: { id: true, disposition: true, status: true, startedAt: true, duration: true },
    take: 5000,
  })

  const buckets = Array.from({ length: 24 }).map((_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    totalCalls: 0,
    answeredCalls: 0,
    missedCalls: 0,
    conversions: 0,
    averageDurationSeconds: 0,
    answerRate: 0,
  }))

  const durationMap: Record<number, number[]> = {}

  calls.forEach(call => {
    const hour = call.startedAt ? new Date(call.startedAt).getHours() : 0
    const bucket = buckets[hour]
    bucket.totalCalls += 1
    if (isAnsweredDisposition(call.disposition)) bucket.answeredCalls += 1
    if (isMissedDisposition(call.disposition, call.status)) bucket.missedCalls += 1
    if (isConversionDisposition(call.disposition)) bucket.conversions += 1
    const duration = Number(call.duration || 0)
    if (duration > 0) {
      durationMap[hour] ??= []
      durationMap[hour].push(duration)
    }
  })

  buckets.forEach(bucket => {
    bucket.answerRate = pct(bucket.answeredCalls, bucket.totalCalls)
    bucket.averageDurationSeconds = average(durationMap[bucket.hour] || [])
  })

  return {
    generatedAt: new Date().toISOString(),
    range: { from: from.toISOString(), to: to.toISOString() },
    buckets,
  }
}

export const getConversionReport = async (range: ReportRange) => {
  const { where, from, to } = buildWhere(range)
  const calls = await prisma.call.findMany({
    where,
    select: { campaignId: true, disposition: true, status: true, duration: true },
    take: 5000,
  })

  const campaignIds = Array.from(new Set(calls.map(call => call.campaignId).filter((id): id is number => typeof id === 'number')))
  const campaigns = campaignIds.length
    ? await prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true, status: true } })
    : []
  const campaignMap = campaigns.reduce<Record<number, { id: number; name: string; status: string }>>((acc, campaign) => {
    acc[campaign.id] = campaign
    return acc
  }, {})

  const byCampaign = calls.reduce<Record<number, typeof calls>>((acc, call) => {
    if (!call.campaignId) return acc
    acc[call.campaignId] ??= []
    acc[call.campaignId].push(call)
    return acc
  }, {})

  return {
    generatedAt: new Date().toISOString(),
    range: { from: from.toISOString(), to: to.toISOString() },
    campaigns: Object.entries(byCampaign).map(([id, rows]) => {
      const campaignId = Number(id)
      const answered = rows.filter(row => isAnsweredDisposition(row.disposition)).length
      const conversions = rows.filter(row => isConversionDisposition(row.disposition)).length
      const missed = rows.filter(row => isMissedDisposition(row.disposition, row.status)).length
      return {
        campaignId,
        name: campaignMap[campaignId]?.name || `Campaign #${campaignId}`,
        status: campaignMap[campaignId]?.status || null,
        totalCalls: rows.length,
        answeredCalls: answered,
        missedCalls: missed,
        conversions,
        answerRate: pct(answered, rows.length),
        conversionRate: pct(conversions, rows.length),
      }
    }).sort((a, b) => b.conversionRate - a.conversionRate),
  }
}

export const getDurationAnalysis = async (range: ReportRange) => {
  const { where, from, to } = buildWhere(range)
  const calls = await prisma.call.findMany({
    where,
    select: { id: true, duration: true, disposition: true, campaignId: true, agentId: true, startedAt: true },
    take: 5000,
  })

  const durations = calls.map(call => Number(call.duration || 0)).filter(value => value > 0).sort((a, b) => a - b)
  const percentile = (p: number) => {
    if (!durations.length) return 0
    const index = Math.min(durations.length - 1, Math.floor((p / 100) * durations.length))
    return durations[index]
  }

  return {
    generatedAt: new Date().toISOString(),
    range: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      callsWithDuration: durations.length,
      averageDurationSeconds: average(durations),
      minDurationSeconds: durations.length ? durations[0] : 0,
      maxDurationSeconds: durations.length ? durations[durations.length - 1] : 0,
      p50DurationSeconds: percentile(50),
      p90DurationSeconds: percentile(90),
    },
    buckets: [
      { label: '0-30s', count: durations.filter(value => value <= 30).length },
      { label: '31-120s', count: durations.filter(value => value > 30 && value <= 120).length },
      { label: '2-5m', count: durations.filter(value => value > 120 && value <= 300).length },
      { label: '5m+', count: durations.filter(value => value > 300).length },
    ],
  }
}

export const getMissedCallReport = async (range: ReportRange) => {
  const { where, from, to } = buildWhere(range)
  const calls = await prisma.call.findMany({
    where,
    select: {
      id: true,
      campaignId: true,
      agentId: true,
      status: true,
      disposition: true,
      remoteNumber: true,
      startedAt: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 5000,
  })

  const missed = calls.filter(call => isMissedDisposition(call.disposition, call.status))
  const byNumber = missed.reduce<Record<string, typeof missed>>((acc, call) => {
    const number = String(call.remoteNumber || 'UNKNOWN')
    acc[number] ??= []
    acc[number].push(call)
    return acc
  }, {})

  return {
    generatedAt: new Date().toISOString(),
    range: { from: from.toISOString(), to: to.toISOString() },
    totalMissedCalls: missed.length,
    repeatMissedNumbers: Object.entries(byNumber)
      .map(([number, rows]) => ({
        number,
        missedCount: rows.length,
        lastMissedAt: rows[0]?.startedAt || null,
        campaignIds: Array.from(new Set(rows.map(row => row.campaignId).filter(Boolean))),
        agentIds: Array.from(new Set(rows.map(row => row.agentId).filter(Boolean))),
      }))
      .filter(row => row.missedCount > 1)
      .sort((a, b) => b.missedCount - a.missedCount),
    missedCalls: missed.slice(0, 100),
  }
}

export const buildDailySummaryEmail = async (range: ReportRange) => {
  const overview = await getOverview(range)
  const agentPerformance = await getAgentPerformance({ ...range, period: 'daily' })
  const conversion = await getConversionReport(range)

  const subject = `PTDT Dialer Daily Summary — ${toYmd(new Date(overview.range.to))}`
  const topAgent = agentPerformance.agents[0]
  const topCampaign = conversion.campaigns[0]

  const body = [
    'PTDT Dialer Daily Summary',
    '',
    `Date Range: ${overview.range.from} to ${overview.range.to}`,
    `Total Calls: ${overview.kpis.totalCalls}`,
    `Answered Calls: ${overview.kpis.answeredCalls} (${overview.kpis.answerRate}%)`,
    `Missed Calls: ${overview.kpis.missedCalls} (${overview.kpis.missedRate}%)`,
    `Conversions: ${overview.kpis.conversions} (${overview.kpis.conversionRate}%)`,
    `Average Duration: ${overview.kpis.averageDurationSeconds}s`,
    '',
    topAgent ? `Top Agent: ${topAgent.name} — ${topAgent.totalCalls} calls, ${topAgent.conversions} conversions` : 'Top Agent: No data',
    topCampaign ? `Top Campaign: ${topCampaign.name} — ${topCampaign.conversionRate}% conversion rate` : 'Top Campaign: No data',
    '',
    'This is an automated PTDT Dialer reporting summary.',
  ].join('\n')

  return {
    generatedAt: new Date().toISOString(),
    providerConfigured: Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY || process.env.BREVO_API_KEY),
    subject,
    body,
    recommendedRecipients: (process.env.REPORTS_EMAIL_RECIPIENTS || process.env.ADMIN_EMAIL || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  }
}

export const sendDailySummaryEmail = async (range: ReportRange) => {
  const email = await buildDailySummaryEmail(range)

  if (!email.providerConfigured) {
    return {
      ...email,
      status: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      message: 'Daily summary email payload is ready. Configure SMTP_HOST, SENDGRID_API_KEY, or BREVO_API_KEY to send automatically.',
    }
  }

  return {
    ...email,
    status: 'EMAIL_SEND_ADAPTER_PENDING',
    message: 'Email provider credentials detected. Add provider-specific sender adapter before enabling production send.',
  }
}

export const buildCampaignPdf = async (campaignId: number, range: ReportRange) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, name: true, status: true } })
  const overview = await getOverview({ ...range, campaignId })
  const duration = await getDurationAnalysis({ ...range, campaignId })
  const missed = await getMissedCallReport({ ...range, campaignId })

  const lines = [
    `Campaign: ${campaign?.name || `#${campaignId}`}`,
    `Status: ${campaign?.status || 'Unknown'}`,
    `Range: ${overview.range.from} to ${overview.range.to}`,
    `Total Calls: ${overview.kpis.totalCalls}`,
    `Answered: ${overview.kpis.answeredCalls} (${overview.kpis.answerRate}%)`,
    `Missed: ${overview.kpis.missedCalls} (${overview.kpis.missedRate}%)`,
    `Conversions: ${overview.kpis.conversions} (${overview.kpis.conversionRate}%)`,
    `Avg Duration: ${overview.kpis.averageDurationSeconds}s`,
    `Max Duration: ${duration.summary.maxDurationSeconds}s`,
    `Repeat Missed Numbers: ${missed.repeatMissedNumbers.length}`,
    `Generated: ${new Date().toISOString()}`,
  ]

  return {
    filename: `ptdt-campaign-${campaignId}-report.pdf`,
    buffer: buildSimplePdf('PTDT Dialer End-of-Campaign Report', lines),
  }
}

export const exportReportCsv = async (range: ReportRange) => {
  const overview = await getOverview(range)
  const rows = [
    ['Metric', 'Value'],
    ['Total Calls', String(overview.kpis.totalCalls)],
    ['Answered Calls', String(overview.kpis.answeredCalls)],
    ['Missed Calls', String(overview.kpis.missedCalls)],
    ['Conversions', String(overview.kpis.conversions)],
    ['Answer Rate', `${overview.kpis.answerRate}%`],
    ['Conversion Rate', `${overview.kpis.conversionRate}%`],
    ['Average Duration Seconds', String(overview.kpis.averageDurationSeconds)],
  ]

  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
}
