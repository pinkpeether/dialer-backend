import { DIALING_MODES, normalizeDialingMode } from '../constants/dialingModes'

export type PacingInput = {
  mode?: string | null
  readyAgents: number
  activeOutboundCalls: number
  dialingRatio?: number | null
  queueSize: number
}

export type PacingResult = {
  slots: number
  mode: string
  reason?: string
  targetCalls: number
  hardCap: number
}

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.floor(num)))
}

export const calculateDialSlots = (input: PacingInput): PacingResult => {
  const mode = normalizeDialingMode(input.mode)
  const readyAgents = clampInt(input.readyAgents, 0, 0, 500)
  const activeOutboundCalls = clampInt(input.activeOutboundCalls, 0, 0, 500)
  const ratio = clampInt(input.dialingRatio, 1, 1, 10)
  const queueSize = clampInt(input.queueSize, 0, 0, 10000)

  if (readyAgents <= 0) return { slots: 0, mode, reason: 'NO_READY_AGENTS', targetCalls: 0, hardCap: 0 }
  if (queueSize <= 0) return { slots: 0, mode, reason: 'EMPTY_QUEUE', targetCalls: 0, hardCap: 0 }

  if (mode === DIALING_MODES.MANUAL || mode === DIALING_MODES.PREVIEW) {
    return { slots: 0, mode, reason: 'MANUAL_OR_PREVIEW_MODE', targetCalls: 0, hardCap: 0 }
  }

  if (mode === DIALING_MODES.PROGRESSIVE) {
    const targetCalls = readyAgents
    const slots = Math.max(0, Math.min(queueSize, targetCalls - activeOutboundCalls))
    return {
      slots,
      mode,
      reason: slots > 0 ? undefined : 'PROGRESSIVE_TARGET_REACHED',
      targetCalls,
      hardCap: readyAgents,
    }
  }

  const targetCalls = readyAgents * ratio
  const hardCap = Math.min(readyAgents * 3, 25)
  const slots = Math.max(0, Math.min(queueSize, targetCalls - activeOutboundCalls, hardCap))

  return {
    slots,
    mode,
    reason: slots > 0 ? undefined : 'PREDICTIVE_TARGET_REACHED',
    targetCalls,
    hardCap,
  }
}
