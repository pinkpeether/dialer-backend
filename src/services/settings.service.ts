import prisma from '../lib/prisma'
import { logAuditEvent } from './audit.service'
import { AUDIT_ACTIONS } from '../constants/auditActions'
import {
  ALLOWED_SETTING_KEYS,
  normalizePartialSettingsUpdate,
} from '../validators/settings.validator'

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  defaultTimezone: 'Asia/Karachi',
  defaultDialingRatio: 1,
  defaultRetryDelayMinutes: 60,
  defaultMaxRetries: 3,
  callTimeoutSeconds: 45,
  recordingEnabled: false,
  callbackReminderMinutes: 15,
  lowContactThreshold: 25,
}

export const getSettings = async () => {
  const rows = await prisma.systemSetting.findMany()
  const values = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    values[row.key] = row.value
  }
  return values
}

export const updateSettings = async (
  updates: Record<string, unknown>,
  actor?: { id: number; email?: string; role?: string },
  ipAddress?: string | null
) => {
  const normalizedUpdates = normalizePartialSettingsUpdate(updates)
  const changed: Record<string, unknown> = {}

  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(normalizedUpdates)) {
      await tx.systemSetting.upsert({
        where: { key },
        update: { value: value as object, updatedBy: actor?.id },
        create: { key, value: value as object, updatedBy: actor?.id },
      })
      changed[key] = value
    }
  })

  await logAuditEvent({
    actor,
    action: AUDIT_ACTIONS.SETTINGS_UPDATE,
    entity: 'SystemSetting',
    metadata: changed,
    ipAddress,
  })

  return getSettings()
}
