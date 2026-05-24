export const isCampaignDialableNow = (campaign: {
  status?: string
  startTime?: string | Date | null
  endTime?: string | Date | null
  timezone?: string | null
  mode?: string | null
}) => {
  const now = new Date()

  if (campaign.status !== 'ACTIVE') {
    return { allowed: false, reason: 'CAMPAIGN_NOT_ACTIVE' }
  }

  if (campaign.mode === 'MANUAL' || campaign.mode === 'PREVIEW') {
    return { allowed: false, reason: 'MANUAL_OR_PREVIEW_MODE' }
  }

  if (campaign.startTime || campaign.endTime) {
    const schedule = getScheduleWindow(campaign.startTime, campaign.endTime, campaign.timezone || 'UTC', now)
    if (!schedule.allowed) return schedule
  }

  return { allowed: true }
}

function getScheduleWindow(
  startTime: string | Date | null | undefined,
  endTime: string | Date | null | undefined,
  timezone: string,
  now: Date
) {
  if (startTime instanceof Date && now < startTime) {
    return { allowed: false, reason: 'BEFORE_START_TIME' }
  }

  if (endTime instanceof Date && now > endTime) {
    return { allowed: false, reason: 'AFTER_END_TIME' }
  }

  const startMinutes = typeof startTime === 'string' ? parseTimeToMinutes(startTime) : null
  const endMinutes = typeof endTime === 'string' ? parseTimeToMinutes(endTime) : null
  if (startMinutes === null && endMinutes === null) return { allowed: true }

  const nowMinutes = getTimezoneMinutes(now, timezone)
  if (startMinutes !== null && endMinutes !== null && startMinutes > endMinutes) {
    const insideOvernight = nowMinutes >= startMinutes || nowMinutes <= endMinutes
    return insideOvernight ? { allowed: true } : { allowed: false, reason: 'OUTSIDE_DIAL_WINDOW' }
  }

  if (startMinutes !== null && nowMinutes < startMinutes) {
    return { allowed: false, reason: 'BEFORE_START_TIME' }
  }

  if (endMinutes !== null && nowMinutes > endMinutes) {
    return { allowed: false, reason: 'AFTER_END_TIME' }
  }

  return { allowed: true }
}

function parseTimeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function getTimezoneMinutes(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const hour = Number(parts.find(part => part.type === 'hour')?.value || '0')
  const minute = Number(parts.find(part => part.type === 'minute')?.value || '0')
  return hour * 60 + minute
}
