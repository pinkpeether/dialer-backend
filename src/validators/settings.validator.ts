import { AppError } from '../middleware/errorHandler'

type Rule = {
  type: 'string' | 'number' | 'boolean'
  min?: number
  max?: number
}

const RULES: Record<string, Rule> = {
  defaultTimezone: { type: 'string' },
  defaultDialingRatio: { type: 'number', min: 1, max: 10 },
  defaultRetryDelayMinutes: { type: 'number', min: 1, max: 1440 },
  defaultMaxRetries: { type: 'number', min: 0, max: 20 },
  callTimeoutSeconds: { type: 'number', min: 5, max: 300 },
  recordingEnabled: { type: 'boolean' },
  callbackReminderMinutes: { type: 'number', min: 0, max: 1440 },
  lowContactThreshold: { type: 'number', min: 0, max: 100000 },
}

export const ALLOWED_SETTING_KEYS = Object.keys(RULES)

export const validateSettingsUpdate = (updates: Record<string, unknown>) => {
  const keys = Object.keys(updates)

  if (!keys.length) {
    throw new AppError('No settings provided', 400)
  }

  const invalidKeys = keys.filter(key => !ALLOWED_SETTING_KEYS.includes(key))
  if (invalidKeys.length) {
    throw new AppError(`Invalid setting key(s): ${invalidKeys.join(', ')}`, 400)
  }

  const normalized: Record<string, unknown> = {}

  for (const key of keys) {
    const rule = RULES[key]
    const value = updates[key]

    if (!rule) {
      throw new AppError(`Unsupported setting: ${key}`, 400)
    }

    if (rule.type === 'number') {
      const numberValue = Number(value)
      if (!Number.isFinite(numberValue)) {
        throw new AppError(`${key} must be a number`, 400)
      }
      if (rule.min !== undefined && numberValue < rule.min) {
        throw new AppError(`${key} must be at least ${rule.min}`, 400)
      }
      if (rule.max !== undefined && numberValue > rule.max) {
        throw new AppError(`${key} must be at most ${rule.max}`, 400)
      }
      normalized[key] = numberValue
      continue
    }

    if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new AppError(`${key} must be true or false`, 400)
      }
      normalized[key] = value
      continue
    }

    if (rule.type === 'string') {
      if (typeof value !== 'string' || !value.trim()) {
        throw new AppError(`${key} must be a non-empty string`, 400)
      }
      normalized[key] = value.trim()
      continue
    }
  }

  return normalized
}

export const normalizePartialSettingsUpdate = (updates: Record<string, unknown>) => {
  const keys = Object.keys(updates)
  if (!keys.length) throw new AppError('No settings provided', 400)

  const invalidKeys = keys.filter(key => !ALLOWED_SETTING_KEYS.includes(key))
  if (invalidKeys.length) throw new AppError(`Invalid setting key(s): ${invalidKeys.join(', ')}`, 400)

  return validateSettingsUpdate(updates)
}
