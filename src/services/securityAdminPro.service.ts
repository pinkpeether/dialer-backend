import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

export type SecurityPolicy = {
  ipWhitelistEnabled: boolean
  allowedIps: string[]
  singleSessionMode: 'OFF' | 'ADVISORY' | 'STRICT'
  backupExportEnabled: boolean
  restoreEnabled: boolean
  requireAdminForExports: boolean
  auditRetentionDays: number
  updatedAt?: string
  updatedBy?: number | null
}

const SETTING_KEY = 'securityAdminPro.policy'

const DEFAULT_POLICY: SecurityPolicy = {
  ipWhitelistEnabled: false,
  allowedIps: [],
  singleSessionMode: 'ADVISORY',
  backupExportEnabled: true,
  restoreEnabled: false,
  requireAdminForExports: true,
  auditRetentionDays: 180,
}

const asArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.map(String).map(item => item.trim()).filter(Boolean)
}

const parseBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
  return fallback
}

const parseNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizePolicy = (value: unknown): SecurityPolicy => {
  const raw = (value || {}) as Record<string, unknown>
  const singleSessionMode = String(raw.singleSessionMode || DEFAULT_POLICY.singleSessionMode).toUpperCase()
  return {
    ipWhitelistEnabled: parseBoolean(raw.ipWhitelistEnabled, DEFAULT_POLICY.ipWhitelistEnabled),
    allowedIps: asArray(raw.allowedIps),
    singleSessionMode: ['OFF', 'ADVISORY', 'STRICT'].includes(singleSessionMode)
      ? singleSessionMode as SecurityPolicy['singleSessionMode']
      : DEFAULT_POLICY.singleSessionMode,
    backupExportEnabled: parseBoolean(raw.backupExportEnabled, DEFAULT_POLICY.backupExportEnabled),
    restoreEnabled: parseBoolean(raw.restoreEnabled, DEFAULT_POLICY.restoreEnabled),
    requireAdminForExports: parseBoolean(raw.requireAdminForExports, DEFAULT_POLICY.requireAdminForExports),
    auditRetentionDays: Math.max(7, parseNumber(raw.auditRetentionDays, DEFAULT_POLICY.auditRetentionDays)),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    updatedBy: typeof raw.updatedBy === 'number' ? raw.updatedBy : null,
  }
}

const redactUser = (user: {
  id: number
  name: string
  email: string
  role: unknown
  status: unknown
  agentCode?: string | null
  extension?: string | null
  phone?: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: String(user.role),
  status: String(user.status),
  agentCode: user.agentCode || null,
  extension: user.extension || null,
  phone: user.phone || null,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
})

const splitCsv = (value?: string): string[] => {
  if (!value) return []
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

const envFlag = (name: string, fallback = false) => parseBoolean(process.env[name], fallback)

const maskSecret = (value?: string) => {
  if (!value) return { configured: false, preview: null }
  if (value.length <= 8) return { configured: true, preview: '********' }
  return { configured: true, preview: `${value.slice(0, 4)}…${value.slice(-4)}` }
}

export const securityAdminProService = {
  async getPolicy(): Promise<SecurityPolicy> {
    const setting = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } })
    if (!setting) return DEFAULT_POLICY
    return normalizePolicy(setting.value)
  },

  async updatePolicy(actorId: number | undefined, patch: Partial<SecurityPolicy>) {
    const current = await this.getPolicy()
    const merged = normalizePolicy({
      ...current,
      ...patch,
      allowedIps: Array.isArray(patch.allowedIps) ? patch.allowedIps : current.allowedIps,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId || null,
    })

    const saved = await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: merged as unknown as Prisma.InputJsonValue, updatedBy: actorId || null },
      create: { key: SETTING_KEY, value: merged as unknown as Prisma.InputJsonValue, updatedBy: actorId || null },
    })

    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'SECURITY_POLICY_UPDATED',
        entity: 'SystemSetting',
        entityId: SETTING_KEY,
        metadata: merged as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => null)

    return normalizePolicy(saved.value)
  },

  async getSecurityOverview() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [policy, totalUsers, activeUsers, adminUsers, auditLast24h, failedAuditLast24h, activeSessionRecords] = await Promise.all([
      this.getPolicy(),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.auditLog.count({ where: { createdAt: { gte: since24h } } }),
      prisma.auditLog.count({
        where: {
          createdAt: { gte: since24h },
          OR: [
            { action: { contains: 'FAIL' } },
            { action: { contains: 'ERROR' } },
            { action: { contains: 'BLOCK' } },
          ],
        },
      }),
      prisma.agentSession.findMany({
        where: { disconnectedAt: null },
        select: { agentId: true },
      }),
    ])

    const sessionCounts = new Map<number, number>()
    activeSessionRecords.forEach(session => {
      sessionCounts.set(session.agentId, (sessionCounts.get(session.agentId) || 0) + 1)
    })
    const duplicateSessionAgentCount = Array.from(sessionCounts.values()).filter(count => count > 1).length

    return {
      policy,
      platform: {
        nodeEnv: process.env.NODE_ENV || 'development',
        trustProxyExpected: true,
        helmetEnabled: true,
        corsConfigured: Boolean(process.env.CORS_ORIGIN || process.env.FRONTEND_URL),
        authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
        apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX || 100),
        jwtExpiry: process.env.JWT_EXPIRES_IN || 'not-set',
      },
      counts: {
        totalUsers,
        activeUsers,
        adminUsers,
        auditLast24h,
        failedAuditLast24h,
        activeSessions: activeSessionRecords.length,
        duplicateSessionAgents: duplicateSessionAgentCount,
      },
      securityScore: this.calculateSecurityScore({
        policy,
        corsConfigured: Boolean(process.env.CORS_ORIGIN || process.env.FRONTEND_URL),
        apiLimit: Number(process.env.API_RATE_LIMIT_MAX || 100),
        authLimit: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
        duplicateSessionAgents: duplicateSessionAgentCount,
      }),
      generatedAt: new Date().toISOString(),
    }
  },

  calculateSecurityScore(input: {
    policy: SecurityPolicy
    corsConfigured: boolean
    apiLimit: number
    authLimit: number
    duplicateSessionAgents: number
  }) {
    let score = 50
    if (input.corsConfigured) score += 10
    if (input.authLimit <= 10) score += 10
    if (input.apiLimit <= 200) score += 8
    if (input.policy.ipWhitelistEnabled && input.policy.allowedIps.length > 0) score += 12
    if (input.policy.singleSessionMode !== 'OFF') score += 7
    if (input.policy.backupExportEnabled && !input.policy.restoreEnabled) score += 3
    if (input.duplicateSessionAgents > 0 && input.policy.singleSessionMode === 'STRICT') score -= 8
    return Math.max(0, Math.min(100, score))
  },

  async getSingleSessionAudit() {
    const sessions = await prisma.agentSession.findMany({
      where: { disconnectedAt: null },
      include: { agent: { select: { id: true, name: true, email: true, role: true, status: true } } },
      orderBy: { connectedAt: 'desc' },
      take: 500,
    })

    const byAgent = new Map<number, typeof sessions>()
    sessions.forEach(session => {
      if (!byAgent.has(session.agentId)) byAgent.set(session.agentId, [])
      byAgent.get(session.agentId)?.push(session)
    })

    const duplicateAgents = Array.from(byAgent.values())
      .filter(agentSessions => agentSessions.length > 1)
      .map(agentSessions => ({
        agent: agentSessions[0].agent,
        activeSessionCount: agentSessions.length,
        newestSessionId: agentSessions[0].socketId,
        staleSessions: agentSessions.slice(1).map(session => ({
          id: session.id,
          socketId: session.socketId,
          status: String(session.status),
          connectedAt: session.connectedAt,
        })),
      }))

    return {
      activeSessionCount: sessions.length,
      duplicateAgentCount: duplicateAgents.length,
      duplicateAgents,
      policy: await this.getPolicy(),
    }
  },

  async disconnectStaleSessions(actorId?: number) {
    const audit = await this.getSingleSessionAudit()
    const staleIds = audit.duplicateAgents.flatMap(agent => agent.staleSessions.map(session => session.id))

    if (staleIds.length === 0) {
      return { disconnected: 0, staleIds: [] }
    }

    await prisma.agentSession.updateMany({
      where: { id: { in: staleIds } },
      data: { disconnectedAt: new Date(), status: 'DISCONNECTED' },
    })

    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'STALE_AGENT_SESSIONS_DISCONNECTED',
        entity: 'AgentSession',
        entityId: staleIds.join(','),
        metadata: { staleIds } as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => null)

    return { disconnected: staleIds.length, staleIds }
  },

  async getBillingOverview() {
    const provider = process.env.CALL_PROVIDER || 'not-set'
    const twilioConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    const openRouterConfigured = Boolean(process.env.OPENROUTER_API_KEY)
    const openAiConfigured = Boolean(process.env.OPENAI_API_KEY)

    return {
      provider,
      sipTrunk: {
        provider: process.env.SIP_TRUNK_PROVIDER || provider,
        accountId: maskSecret(process.env.SIP_TRUNK_ACCOUNT_ID),
        balanceUsd: process.env.SIP_TRUNK_BALANCE_USD || null,
        lowBalanceThresholdUsd: process.env.SIP_TRUNK_LOW_BALANCE_USD || '10',
      },
      twilio: {
        configured: twilioConfigured,
        accountSid: maskSecret(process.env.TWILIO_ACCOUNT_SID),
        fromNumberConfigured: Boolean(process.env.TWILIO_PHONE_NUMBER),
        estimatedBalanceUsd: process.env.TWILIO_BALANCE_USD || null,
      },
      ai: {
        openRouterConfigured,
        openAiConfigured,
        dailyLimitUsd: process.env.AI_DAILY_LIMIT_USD || null,
        monthlyLimitUsd: process.env.AI_MONTHLY_LIMIT_USD || null,
      },
      railway: {
        plan: process.env.RAILWAY_PLAN || null,
        service: process.env.RAILWAY_SERVICE_NAME || null,
      },
      supabase: {
        projectRef: maskSecret(process.env.SUPABASE_PROJECT_REF),
        storageBucket: process.env.SUPABASE_STORAGE_BUCKET || process.env.RECORDINGS_BUCKET || null,
      },
      generatedAt: new Date().toISOString(),
    }
  },

  async getBackupExport(actorId?: number) {
    const policy = await this.getPolicy()
    if (!policy.backupExportEnabled) {
      throw new Error('Backup export is disabled by security policy.')
    }

    const [users, campaigns, contacts, calls, dnc, settings, recentAuditLogs] = await Promise.all([
      prisma.user.findMany({ orderBy: { id: 'asc' } }),
      prisma.campaign.findMany({ orderBy: { id: 'asc' } }),
      prisma.contact.findMany({ orderBy: { id: 'asc' }, take: 5000 }),
      prisma.call.findMany({
        orderBy: { id: 'desc' },
        take: 5000,
        select: {
          id: true,
          contactId: true,
          campaignId: true,
          agentId: true,
          providerCallId: true,
          twilioCallSid: true,
          direction: true,
          remoteNumber: true,
          source: true,
          status: true,
          disposition: true,
          duration: true,
          recordingSid: true,
          connectedAt: true,
          startedAt: true,
          endedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.dNCList.findMany({ orderBy: { id: 'asc' } }),
      prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
    ])

    const backup = {
      schema: 'ptdt-dialer-security-backup-v1',
      exportedAt: new Date().toISOString(),
      exportedBy: actorId || null,
      policy,
      counts: {
        users: users.length,
        campaigns: campaigns.length,
        contacts: contacts.length,
        calls: calls.length,
        dnc: dnc.length,
        settings: settings.length,
        recentAuditLogs: recentAuditLogs.length,
      },
      data: {
        users: users.map(redactUser),
        campaigns,
        contacts,
        calls,
        dnc,
        settings,
        recentAuditLogs,
      },
    }

    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'BACKUP_EXPORTED',
        entity: 'SecurityAdminPro',
        metadata: backup.counts as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => null)

    return backup
  },

  async previewRestore(payload: unknown) {
    const raw = payload as { schema?: string; data?: Record<string, unknown[]> }
    if (raw?.schema !== 'ptdt-dialer-security-backup-v1') {
      return {
        valid: false,
        message: 'Unsupported backup schema.',
        counts: {},
      }
    }

    const data = raw.data || {}
    return {
      valid: true,
      message: 'Backup structure looks valid. Restore is intentionally disabled by default for pilot safety.',
      counts: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])),
    }
  },

  async getHardeningChecklist() {
    const policy = await this.getPolicy()
    return [
      {
        key: 'helmet',
        title: 'Helmet security headers',
        status: 'PASS',
        detail: 'helmet({ contentSecurityPolicy: false }) is mounted in app.ts. CSP can be tightened in production after frontend asset audit.',
      },
      {
        key: 'rate-limiting',
        title: 'API and auth rate limiting',
        status: Number(process.env.AUTH_RATE_LIMIT_MAX || 10) <= 10 ? 'PASS' : 'WARN',
        detail: `AUTH_RATE_LIMIT_MAX=${process.env.AUTH_RATE_LIMIT_MAX || 10}, API_RATE_LIMIT_MAX=${process.env.API_RATE_LIMIT_MAX || 100}`,
      },
      {
        key: 'cors',
        title: 'CORS origin allow-list',
        status: process.env.CORS_ORIGIN || process.env.FRONTEND_URL ? 'PASS' : 'WARN',
        detail: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'No explicit CORS_ORIGIN/FRONTEND_URL found.',
      },
      {
        key: 'ip-whitelist',
        title: 'Admin IP whitelist',
        status: policy.ipWhitelistEnabled && policy.allowedIps.length > 0 ? 'PASS' : 'ADVISORY',
        detail: policy.ipWhitelistEnabled ? `${policy.allowedIps.length} IP/range entries configured.` : 'Disabled for pilot flexibility.',
      },
      {
        key: 'single-session',
        title: 'Single-session management',
        status: policy.singleSessionMode === 'STRICT' ? 'PASS' : 'ADVISORY',
        detail: `Mode: ${policy.singleSessionMode}`,
      },
      {
        key: 'backup-restore',
        title: 'Backup / restore guardrails',
        status: policy.backupExportEnabled && !policy.restoreEnabled ? 'PASS' : 'WARN',
        detail: `Backup export: ${policy.backupExportEnabled ? 'enabled' : 'disabled'}, restore: ${policy.restoreEnabled ? 'enabled' : 'disabled'}`,
      },
      {
        key: 'secrets',
        title: 'Secret configuration',
        status: process.env.JWT_SECRET ? 'PASS' : 'FAIL',
        detail: process.env.JWT_SECRET ? 'JWT_SECRET configured.' : 'JWT_SECRET missing.',
      },
    ]
  },

  async isIpAllowed(ip: string) {
    const policy = await this.getPolicy()
    if (!policy.ipWhitelistEnabled) return { allowed: true, policy }
    const cleanIp = ip.replace('::ffff:', '')
    const allowed = policy.allowedIps.some(entry => {
      const trimmed = entry.trim()
      if (!trimmed) return false
      if (trimmed === cleanIp || trimmed === ip) return true
      if (trimmed.endsWith('*')) return cleanIp.startsWith(trimmed.slice(0, -1))
      return false
    })
    return { allowed, policy }
  },
}
