import prisma from '../lib/prisma'

type AlertSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL'
type AlertType =
  | 'DESKTOP_TOAST'
  | 'SOUND_ALERT'
  | 'ANGRY_CUSTOMER'
  | 'SHIFT_REMINDER'
  | 'BREAK_REMINDER'
  | 'CAMPAIGN_COMPLETE'
  | 'LOW_CONTACTS'
  | 'SYSTEM_NOTICE'

export type NotificationAlert = {
  id: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  audience: Array<'ADMIN' | 'SUPERVISOR' | 'AGENT'>
  agentId?: number | null
  campaignId?: number | null
  callId?: number | null
  soundKey?: string | null
  actionUrl?: string | null
  createdAt: string
  expiresAt?: string | null
  acknowledgedBy: number[]
  metadata?: Record<string, unknown>
}

export type AlertPreferences = {
  desktopToasts: boolean
  soundAlerts: boolean
  angryCustomerAlerts: boolean
  shiftReminders: boolean
  breakReminders: boolean
  campaignCompleteAlerts: boolean
  lowContactWarnings: boolean
  lowContactThreshold: number
  quietHoursEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
  sounds: {
    info: string
    success: string
    warning: string
    critical: string
  }
}

const DEFAULT_PREFERENCES: AlertPreferences = {
  desktopToasts: true,
  soundAlerts: true,
  angryCustomerAlerts: true,
  shiftReminders: true,
  breakReminders: true,
  campaignCompleteAlerts: true,
  lowContactWarnings: true,
  lowContactThreshold: 25,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  sounds: {
    info: 'soft-ping',
    success: 'success-chime',
    warning: 'attention',
    critical: 'urgent',
  },
}

const alerts: NotificationAlert[] = []
const preferencesByUser = new Map<number, AlertPreferences>()

function nowIso() {
  return new Date().toISOString()
}

function newAlertId(type: AlertType) {
  return `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getPreferences(userId: number): AlertPreferences {
  return preferencesByUser.get(userId) || { ...DEFAULT_PREFERENCES, sounds: { ...DEFAULT_PREFERENCES.sounds } }
}

function normalizeAudience(audience?: string[]): NotificationAlert['audience'] {
  const allowed = new Set(['ADMIN', 'SUPERVISOR', 'AGENT'])
  const cleaned = (audience || ['ADMIN', 'SUPERVISOR']).filter((role) => allowed.has(role)) as NotificationAlert['audience']
  return cleaned.length ? cleaned : ['ADMIN', 'SUPERVISOR']
}

function pushAlert(input: Omit<NotificationAlert, 'id' | 'createdAt' | 'acknowledgedBy'>) {
  const alert: NotificationAlert = {
    ...input,
    id: newAlertId(input.type),
    createdAt: nowIso(),
    acknowledgedBy: [],
  }
  alerts.unshift(alert)
  if (alerts.length > 500) alerts.splice(500)
  return alert
}

function isCampaignCompleteStatus(status?: string | null) {
  return ['COMPLETED', 'FINISHED', 'ENDED', 'DONE'].includes(String(status || '').toUpperCase())
}

export async function getAlertPreferences(userId: number) {
  return getPreferences(userId)
}

export async function updateAlertPreferences(userId: number, patch: Partial<AlertPreferences>) {
  const current = getPreferences(userId)
  const next: AlertPreferences = {
    ...current,
    ...patch,
    sounds: {
      ...current.sounds,
      ...(patch.sounds || {}),
    },
  }
  preferencesByUser.set(userId, next)
  return next
}

export async function createManualAlert(payload: {
  type?: AlertType
  severity?: AlertSeverity
  title: string
  message: string
  audience?: string[]
  agentId?: number | null
  campaignId?: number | null
  callId?: number | null
  soundKey?: string | null
  actionUrl?: string | null
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}) {
  return pushAlert({
    type: payload.type || 'SYSTEM_NOTICE',
    severity: payload.severity || 'INFO',
    title: payload.title,
    message: payload.message,
    audience: normalizeAudience(payload.audience),
    agentId: payload.agentId ?? null,
    campaignId: payload.campaignId ?? null,
    callId: payload.callId ?? null,
    soundKey: payload.soundKey ?? null,
    actionUrl: payload.actionUrl ?? null,
    expiresAt: payload.expiresAt ?? null,
    metadata: payload.metadata || {},
  })
}

export async function listAlerts(params: {
  userId?: number
  role?: string
  onlyUnread?: boolean
  severity?: string
  type?: string
  limit?: number
}) {
  const limit = Math.min(Math.max(Number(params.limit || 100), 1), 200)
  const role = String(params.role || '').toUpperCase()
  const userId = Number(params.userId || 0)

  return alerts
    .filter((alert) => {
      if (role && !alert.audience.includes(role as any)) return false
      if (params.onlyUnread && userId && alert.acknowledgedBy.includes(userId)) return false
      if (params.severity && alert.severity !== params.severity) return false
      if (params.type && alert.type !== params.type) return false
      if (alert.expiresAt && new Date(alert.expiresAt).getTime() < Date.now()) return false
      return true
    })
    .slice(0, limit)
}

export async function acknowledgeAlert(alertId: string, userId: number) {
  const alert = alerts.find((item) => item.id === alertId)
  if (!alert) {
    const error = new Error('Alert not found')
    ;(error as any).statusCode = 404
    throw error
  }
  if (!alert.acknowledgedBy.includes(userId)) alert.acknowledgedBy.push(userId)
  return alert
}

export async function acknowledgeAllAlerts(userId: number, role?: string) {
  const visible = await listAlerts({ userId, role, limit: 500 })
  visible.forEach((alert) => {
    if (!alert.acknowledgedBy.includes(userId)) alert.acknowledgedBy.push(userId)
  })
  return { acknowledged: visible.length }
}

export async function evaluateLowContactWarnings() {
  const threshold = DEFAULT_PREFERENCES.lowContactThreshold
  const campaigns = await prisma.campaign.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      contacts: {
        where: {
          status: {
            in: ['PENDING', 'NO_ANSWER', 'BUSY', 'CALLBACK'],
          },
        },
        select: { id: true },
      },
    },
    take: 100,
  })

  const created: NotificationAlert[] = []
  campaigns.forEach((campaign) => {
    const remaining = campaign.contacts?.length || 0
    if (remaining <= threshold && !isCampaignCompleteStatus(campaign.status)) {
      const exists = alerts.some((alert) => alert.type === 'LOW_CONTACTS' && alert.campaignId === campaign.id && !alert.acknowledgedBy.length)
      if (!exists) {
        created.push(
          pushAlert({
            type: 'LOW_CONTACTS',
            severity: remaining === 0 ? 'CRITICAL' : 'WARNING',
            title: 'Low campaign contacts',
            message: `${campaign.name || `Campaign ${campaign.id}`} has ${remaining} callable contacts remaining.`,
            audience: ['ADMIN', 'SUPERVISOR'],
            campaignId: campaign.id,
            soundKey: remaining === 0 ? DEFAULT_PREFERENCES.sounds.critical : DEFAULT_PREFERENCES.sounds.warning,
            actionUrl: `/campaigns/${campaign.id}`,
            metadata: { remaining, threshold },
          }),
        )
      }
    }
  })
  return { created, checked: campaigns.length }
}

export async function evaluateCampaignCompleteAlerts() {
  const campaigns = await prisma.campaign.findMany({
    select: { id: true, name: true, status: true, updatedAt: true },
    take: 100,
  })

  const created: NotificationAlert[] = []
  campaigns.forEach((campaign) => {
    if (!isCampaignCompleteStatus(campaign.status)) return
    const exists = alerts.some((alert) => alert.type === 'CAMPAIGN_COMPLETE' && alert.campaignId === campaign.id)
    if (!exists) {
      created.push(
        pushAlert({
          type: 'CAMPAIGN_COMPLETE',
          severity: 'SUCCESS',
          title: 'Campaign complete',
          message: `${campaign.name || `Campaign ${campaign.id}`} is complete.`,
          audience: ['ADMIN', 'SUPERVISOR'],
          campaignId: campaign.id,
          soundKey: DEFAULT_PREFERENCES.sounds.success,
          actionUrl: `/campaigns/${campaign.id}`,
          metadata: { status: campaign.status, updatedAt: campaign.updatedAt },
        }),
      )
    }
  })
  return { created, checked: campaigns.length }
}

export async function createAngryCustomerAlert(payload: {
  callId?: number
  agentId?: number
  sentimentScore?: number
  reason?: string
  transcriptSnippet?: string
}) {
  return pushAlert({
    type: 'ANGRY_CUSTOMER',
    severity: 'CRITICAL',
    title: 'Angry customer alert',
    message: payload.reason || 'Live AI detected a high-risk angry customer conversation.',
    audience: ['ADMIN', 'SUPERVISOR'],
    agentId: payload.agentId || null,
    callId: payload.callId || null,
    soundKey: DEFAULT_PREFERENCES.sounds.critical,
    actionUrl: payload.callId ? `/call-intelligence?callId=${payload.callId}` : '/live-ai-console',
    metadata: {
      sentimentScore: payload.sentimentScore,
      transcriptSnippet: payload.transcriptSnippet,
    },
  })
}

export async function createShiftReminder(payload: {
  agentId: number
  agentName?: string
  startsAt?: string
  endsAt?: string
  reminderType?: 'SHIFT_START' | 'SHIFT_END' | 'BREAK_DUE' | 'BREAK_OVER'
}) {
  const reminderType = payload.reminderType || 'SHIFT_START'
  const titleMap: Record<string, string> = {
    SHIFT_START: 'Shift reminder',
    SHIFT_END: 'Shift ending reminder',
    BREAK_DUE: 'Break reminder',
    BREAK_OVER: 'Break ending reminder',
  }
  return pushAlert({
    type: reminderType.includes('BREAK') ? 'BREAK_REMINDER' : 'SHIFT_REMINDER',
    severity: reminderType.includes('END') || reminderType.includes('OVER') ? 'INFO' : 'WARNING',
    title: titleMap[reminderType],
    message: `${payload.agentName || `Agent ${payload.agentId}`}: ${titleMap[reminderType].toLowerCase()}.`,
    audience: ['ADMIN', 'SUPERVISOR', 'AGENT'],
    agentId: payload.agentId,
    soundKey: DEFAULT_PREFERENCES.sounds.warning,
    actionUrl: '/agent-management-pro',
    metadata: payload,
  })
}

export async function runAlertSweep() {
  const lowContacts = await evaluateLowContactWarnings()
  const completedCampaigns = await evaluateCampaignCompleteAlerts()
  return {
    ranAt: nowIso(),
    lowContacts,
    completedCampaigns,
    totalActiveAlerts: alerts.length,
  }
}

export async function getAlertSummary(params: { userId?: number; role?: string }) {
  const visible = await listAlerts({ userId: params.userId, role: params.role, limit: 500 })
  const unread = visible.filter((alert) => params.userId && !alert.acknowledgedBy.includes(params.userId)).length
  const bySeverity = visible.reduce<Record<string, number>>((acc, alert) => {
    acc[alert.severity] = (acc[alert.severity] || 0) + 1
    return acc
  }, {})
  const byType = visible.reduce<Record<string, number>>((acc, alert) => {
    acc[alert.type] = (acc[alert.type] || 0) + 1
    return acc
  }, {})
  return {
    total: visible.length,
    unread,
    bySeverity,
    byType,
    latest: visible.slice(0, 10),
    preferences: params.userId ? getPreferences(params.userId) : DEFAULT_PREFERENCES,
  }
}
