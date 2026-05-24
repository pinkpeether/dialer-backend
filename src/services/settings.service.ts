import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'

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

export const ALLOWED_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS)

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
  const keys = Object.keys(updates)
  const invalid = keys.filter(key => !ALLOWED_SETTING_KEYS.includes(key))
  if (invalid.length) throw new AppError(`Invalid setting key(s): ${invalid.join(', ')}`, 400)

  const changed: Record<string, unknown> = {}

  await prisma.$transaction(async (tx) => {
    for (const key of keys) {
      await tx.systemSetting.upsert({
        where: { key },
        update: { value: updates[key] as object, updatedBy: actor?.id },
        create: { key, value: updates[key] as object, updatedBy: actor?.id },
      })
      changed[key] = updates[key]
    }
  })

  await logAuditEvent({
    actor,
    action: 'settings.update',
    entity: 'SystemSetting',
    metadata: changed,
    ipAddress,
  })

  return getSettings()
}
