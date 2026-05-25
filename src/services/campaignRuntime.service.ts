import { DIALING_MODES, normalizeDialingMode } from '../constants/dialingModes'

type CampaignLike = {
  status?: string | null
  mode?: string | null
  startTime?: string | null
  endTime?: string | null
  timezone?: string | null
}

const getLocalMinutes = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0)
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0)
  return hour * 60 + minute
}

const parseTimeToMinutes = (value?: string | null) => {
  if (!value) return null
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export const isCampaignRuntimeAllowed = (campaign: CampaignLike, now = new Date()) => {
  const mode = normalizeDialingMode(campaign.mode)

  if (campaign.status !== 'ACTIVE') return { allowed: false, reason: 'CAMPAIGN_NOT_ACTIVE', mode }

  if (mode === DIALING_MODES.MANUAL || mode === DIALING_MODES.PREVIEW) {
    return { allowed: false, reason: 'MANUAL_OR_PREVIEW_MODE', mode }
  }

  const timezone = campaign.timezone || 'UTC'
  const start = parseTimeToMinutes(campaign.startTime)
  const end = parseTimeToMinutes(campaign.endTime)

  if (start === null && end === null) return { allowed: true, mode }

  const localNow = getLocalMinutes(now, timezone)

  if (start !== null && end !== null) {
    const sameDayWindow = start <= end
    const inside = sameDayWindow
      ? localNow >= start && localNow <= end
      : localNow >= start || localNow <= end

    if (!inside) return { allowed: false, reason: 'OUTSIDE_CAMPAIGN_TIME_WINDOW', mode }
  } else if (start !== null && localNow < start) {
    return { allowed: false, reason: 'BEFORE_START_TIME', mode }
  } else if (end !== null && localNow > end) {
    return { allowed: false, reason: 'AFTER_END_TIME', mode }
  }

  return { allowed: true, mode }
}
