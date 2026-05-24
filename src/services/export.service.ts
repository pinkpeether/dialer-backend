import prisma from '../lib/prisma'
import { toCsv } from '../utils/csv'

export const exportCallsCsv = async (filters: {
  from?: Date
  to?: Date
  campaignId?: number
  agentId?: number
}) => {
  const where: Record<string, unknown> = {}
  if (filters.campaignId) where.campaignId = filters.campaignId
  if (filters.agentId) where.agentId = filters.agentId
  if (filters.from || filters.to) {
    where.startedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }

  const calls = await prisma.call.findMany({
    where,
    include: {
      contact: true,
      agent: { select: { name: true, agentCode: true } },
      campaign: { select: { name: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 5000,
  })

  return toCsv(calls.map(call => ({
    id: call.id,
    startedAt: call.startedAt?.toISOString(),
    endedAt: call.endedAt?.toISOString() || '',
    duration: call.duration || '',
    status: call.status,
    disposition: call.disposition || '',
    notes: call.notes || '',
    contactName: call.contact?.name || '',
    phone: call.contact?.phone || call.remoteNumber || '',
    agent: call.agent?.name || '',
    campaign: call.campaign?.name || '',
  })), [
    { key: 'id', label: 'Call ID' },
    { key: 'startedAt', label: 'Started At' },
    { key: 'endedAt', label: 'Ended At' },
    { key: 'duration', label: 'Duration Seconds' },
    { key: 'status', label: 'Status' },
    { key: 'disposition', label: 'Disposition' },
    { key: 'notes', label: 'Notes' },
    { key: 'contactName', label: 'Contact Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'agent', label: 'Agent' },
    { key: 'campaign', label: 'Campaign' },
  ])
}

export const exportContactsCsv = async (filters: {
  campaignId?: number
  status?: string
  search?: string
}) => {
  const where: Record<string, unknown> = {}
  if (filters.campaignId) where.campaignId = filters.campaignId
  if (filters.status) where.status = filters.status
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
    include: { campaign: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })

  return toCsv(contacts.map(contact => ({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email || '',
    company: contact.company || '',
    status: contact.status,
    retryCount: contact.retryCount,
    maxRetries: contact.maxRetries,
    callbackAt: contact.callbackAt?.toISOString() || '',
    nextRetryAt: (contact as any).nextRetryAt?.toISOString?.() || '',
    campaign: contact.campaign?.name || '',
  })), [
    { key: 'id', label: 'Contact ID' },
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'company', label: 'Company' },
    { key: 'status', label: 'Status' },
    { key: 'retryCount', label: 'Retry Count' },
    { key: 'maxRetries', label: 'Max Retries' },
    { key: 'callbackAt', label: 'Callback At' },
    { key: 'nextRetryAt', label: 'Next Retry At' },
    { key: 'campaign', label: 'Campaign' },
  ])
}

export const exportCampaignCsv = async (campaignId: number) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      contacts: true,
      calls: true,
    },
  })

  if (!campaign) return 'Metric,Value\nError,Campaign not found\n'

  const totalCalls = campaign.calls.length
  const answered = campaign.calls.filter(c => c.disposition === 'ANSWERED').length
  const callbacks = campaign.calls.filter(c => c.disposition === 'CALLBACK').length

  return toCsv([
    { metric: 'Campaign ID', value: campaign.id },
    { metric: 'Campaign Name', value: campaign.name },
    { metric: 'Status', value: campaign.status },
    { metric: 'Total Contacts', value: campaign.contacts.length },
    { metric: 'Total Calls', value: totalCalls },
    { metric: 'Answered Calls', value: answered },
    { metric: 'Callback Calls', value: callbacks },
    { metric: 'Answer Rate', value: totalCalls ? `${Math.round((answered / totalCalls) * 1000) / 10}%` : '0%' },
  ], [
    { key: 'metric', label: 'Metric' },
    { key: 'value', label: 'Value' },
  ])
}
