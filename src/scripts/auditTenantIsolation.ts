import prisma from '../lib/prisma'
import * as ExportService from '../services/export.service'
import * as CallIntelligenceService from '../services/callIntelligence.service'
import * as LiveAiService from '../services/liveAi.service'
import * as AlertsService from '../services/notificationsAlertsPro.service'
import * as AiCallLogService from '../services/aiCallLog.service'
import type { ScopeActor } from '../services/commercialScope.service'

const confirm = String(process.env.AUDIT_TENANT_ISOLATION_CONFIRM || '').trim().toLowerCase()

if (confirm !== 'run') {
  console.error('Refusing to run. Set AUDIT_TENANT_ISOLATION_CONFIRM=run to execute this DB-writing tenant-isolation proof.')
  process.exit(1)
}

const runId = `AUDIT_TENANT_${Date.now()}`
const markerA = `${runId}_A_ONLY`
const markerB = `${runId}_B_ONLY`

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const expectDenied = async (label: string, task: () => Promise<unknown>) => {
  try {
    const result = await task()
    if (result === null || result === undefined) return { label, denied: true, mode: 'null' }
    throw new Error(`${label} leaked data`)
  } catch (error) {
    const status = Number((error as { statusCode?: number })?.statusCode || 0)
    if (status === 403 || status === 404) return { label, denied: true, status }
    if (error instanceof Error && /not found|commercial account|no active/i.test(error.message)) {
      return { label, denied: true, message: error.message }
    }
    throw error
  }
}

async function cleanup() {
  await prisma.callTranscript.deleteMany({ where: { call: { campaign: { name: { startsWith: runId } } } } })
  await prisma.callInsight.deleteMany({ where: { call: { campaign: { name: { startsWith: runId } } } } })
  await prisma.callback.deleteMany({ where: { call: { campaign: { name: { startsWith: runId } } } } })
  await prisma.aiCallLog.deleteMany({ where: { providerCallId: { startsWith: runId } } })
  await prisma.call.deleteMany({ where: { campaign: { name: { startsWith: runId } } } })
  await prisma.contact.deleteMany({ where: { campaign: { name: { startsWith: runId } } } })
  await prisma.campaign.deleteMany({ where: { name: { startsWith: runId } } })
  await prisma.commercialAccountMembership.deleteMany({ where: { account: { code: { startsWith: runId } } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: 'audit_tenant_', endsWith: '@audit.local' } } })
  await prisma.commercialAccount.deleteMany({ where: { code: { startsWith: runId } } })
}

async function createTenant(suffix: 'A' | 'B') {
  const account = await prisma.commercialAccount.create({
    data: {
      name: `${runId} Tenant ${suffix}`,
      code: `${runId}_${suffix}`,
      status: 'ACTIVE',
      currency: 'EUR',
    },
  })
  const user = await prisma.user.create({
    data: {
      name: `${runId} Supervisor ${suffix}`,
      email: `${runId.toLowerCase()}-${suffix.toLowerCase()}@audit.local`,
      passwordHash: 'audit-not-a-login-password',
      role: 'SUPERVISOR',
      status: 'READY',
      isActive: true,
      agentCode: `${runId}_${suffix}_SUP`.slice(0, 60),
    },
  })
  await prisma.commercialAccountMembership.create({
    data: {
      accountId: account.id,
      userId: user.id,
      accountRole: 'SUPERVISOR',
      status: 'ACTIVE',
      canManageCampaigns: true,
      canViewReports: true,
    },
  })
  const campaign = await prisma.campaign.create({
    data: {
      name: `${runId}_${suffix}_CAMPAIGN`,
      status: 'ACTIVE',
      callerId: '+15550000000',
      commercialAccountId: account.id,
      script: `Script ${suffix}`,
    },
  })
  const contact = await prisma.contact.create({
    data: {
      campaignId: campaign.id,
      name: suffix === 'A' ? markerA : markerB,
      phone: suffix === 'A' ? '9990010001' : '9990020001',
      status: 'PENDING',
    },
  })
  const call = await prisma.call.create({
    data: {
      contactId: contact.id,
      campaignId: campaign.id,
      agentId: user.id,
      direction: 'outgoing',
      remoteNumber: contact.phone,
      status: 'COMPLETED',
      disposition: 'ANSWERED',
      duration: 60,
      recordingUrl: `https://recordings.audit.local/${suffix}.wav`,
    },
  })
  await prisma.aiCallLog.create({
    data: {
      provider: 'retell',
      providerCallId: `${runId}_${suffix}_PROVIDER_CALL`,
      commercialAccountId: account.id,
      requestedByUserId: user.id,
      lastEvent: 'audit',
      callStatus: 'ended',
      direction: 'outbound',
      toNumber: contact.phone,
    },
  })
  const actor: ScopeActor = { id: user.id, email: user.email, role: user.role }
  return { account, user, campaign, contact, call, actor }
}

async function main() {
  await cleanup()
  try {
    const tenantA = await createTenant('A')
    const tenantB = await createTenant('B')

    const evidence: Record<string, unknown> = {}

    const callsCsvB = await ExportService.exportCallsCsv({}, tenantB.actor)
    const contactsCsvB = await ExportService.exportContactsCsv({}, tenantB.actor)
    assert(!callsCsvB.includes(markerA) && callsCsvB.includes(markerB), 'Calls CSV leaked tenant A or missed tenant B data')
    assert(!contactsCsvB.includes(markerA) && contactsCsvB.includes(markerB), 'Contacts CSV leaked tenant A or missed tenant B data')
    evidence.exports = {
      tenantBCallsContainsA: callsCsvB.includes(markerA),
      tenantBContactsContainsA: contactsCsvB.includes(markerA),
      tenantBContactsContainsB: contactsCsvB.includes(markerB),
      campaignADeniedToTenantB: await expectDenied('campaign export tenant A to tenant B', () => ExportService.exportCampaignCsv(tenantA.campaign.id, tenantB.actor)),
    }

    const tenantAIntelligence = await CallIntelligenceService.getCallIntelligence(tenantA.call.id, tenantA.actor)
    evidence.callIntelligence = {
      tenantAStatus: tenantAIntelligence.status,
      tenantBDenied: await expectDenied('call intelligence tenant A to tenant B', () => CallIntelligenceService.getCallIntelligence(tenantA.call.id, tenantB.actor)),
    }

    await LiveAiService.startLiveAiSession(tenantA.call.id, tenantA.actor)
    const liveSessionsForB = await LiveAiService.listLiveAiSessions(tenantB.actor)
    evidence.liveAi = {
      tenantBVisibleTenantASessions: liveSessionsForB.filter(session => session.callId === tenantA.call.id).length,
      tenantBDeniedSession: await expectDenied('live ai tenant A session to tenant B', () => LiveAiService.getLiveAiSession(tenantA.call.id, tenantB.actor)),
    }
    assert((evidence.liveAi as any).tenantBVisibleTenantASessions === 0, 'Live AI list leaked tenant A session to tenant B')

    const alertA = await AlertsService.createManualAlert({
      title: `${markerA} Alert`,
      message: 'Tenant A only alert',
      callId: tenantA.call.id,
      audience: ['SUPERVISOR'],
    }, tenantA.actor)
    const alertsForB = await AlertsService.listAlerts({ userId: tenantB.user.id, role: tenantB.user.role, actor: tenantB.actor, limit: 50 })
    evidence.alerts = {
      tenantBVisibleTenantAAlerts: alertsForB.filter(alert => alert.id === alertA.id || alert.title.includes(markerA)).length,
      tenantBDeniedAck: await expectDenied('tenant B acknowledge tenant A alert', () => AlertsService.acknowledgeAlert(alertA.id, tenantB.user.id, tenantB.actor)),
    }
    assert((evidence.alerts as any).tenantBVisibleTenantAAlerts === 0, 'Alerts leaked tenant A alert to tenant B')

    const aiLogsForB = await AiCallLogService.listAiCallLogRecords({ page: 1, limit: 50 }, tenantB.actor)
    const aiLogAForB = await AiCallLogService.getAiCallLogRecordByProviderCallId(`${runId}_A_PROVIDER_CALL`, false, tenantB.actor)
    evidence.aiCallLogs = {
      tenantBVisibleTenantALogs: aiLogsForB.items.filter(item => item.providerCallId === `${runId}_A_PROVIDER_CALL`).length,
      tenantBDirectTenantALog: aiLogAForB ? 'LEAKED' : 'DENIED',
    }
    assert((evidence.aiCallLogs as any).tenantBVisibleTenantALogs === 0, 'AI call logs list leaked tenant A to tenant B')
    assert(!aiLogAForB, 'AI call log direct lookup leaked tenant A to tenant B')

    console.log(JSON.stringify({
      runId,
      tenantA: { accountId: tenantA.account.id, userId: tenantA.user.id, campaignId: tenantA.campaign.id, callId: tenantA.call.id },
      tenantB: { accountId: tenantB.account.id, userId: tenantB.user.id, campaignId: tenantB.campaign.id, callId: tenantB.call.id },
      evidence,
      passed: true,
    }, null, 2))
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }
}

void main().catch(async error => {
  console.error(error)
  await cleanup().catch(() => undefined)
  await prisma.$disconnect()
  process.exit(1)
})
