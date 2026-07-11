export type PacingInput = {
  readyAgents: number
  answerRate: number
  activeCalls?: number
  abandonRate?: number
  autoDialLevel?: number
  adaptiveDialEnabled?: boolean
  maxAbandonRate?: number
  maxSimultaneousCalls?: number
  maxCallsPerReadyAgent?: number
  safetyMultiplier?: number
}

export const calculatePredictivePacingV2 = (input: PacingInput) => {
  const readyAgents = Math.max(0, Math.floor(input.readyAgents || 0))
  const answerRate = Math.max(0.01, Math.min(1, input.answerRate || 0.1))
  const activeCalls = Math.max(0, Math.floor(input.activeCalls || 0))
  const abandonRate = Math.max(0, Math.min(1, input.abandonRate || 0))
  const maxAbandonRate = Math.max(0, Math.min(0.2, input.maxAbandonRate ?? 0.03))
  const baseDialLevel = Math.max(0, Math.min(3, input.autoDialLevel ?? input.maxCallsPerReadyAgent ?? 1))
  const adaptiveDialEnabled = input.adaptiveDialEnabled !== false
  const maxCallsPerReadyAgent = Math.max(0.5, Math.min(5, input.maxCallsPerReadyAgent || Math.max(1, baseDialLevel || 1)))
  const safetyMultiplier = Math.max(0.5, Math.min(1.5, input.safetyMultiplier || 0.85))
  const simultaneousCap = Math.max(1, Math.min(500, input.maxSimultaneousCalls || 50))

  let effectiveDialLevel = baseDialLevel
  const adjustmentReasons: string[] = []

  if (readyAgents === 0 || baseDialLevel === 0) {
    effectiveDialLevel = 0
  } else if (adaptiveDialEnabled) {
    if (abandonRate > maxAbandonRate) {
      effectiveDialLevel = Math.max(0.5, baseDialLevel - 0.5)
      adjustmentReasons.push('ABANDON_RATE_PROTECTION')
    } else if (answerRate < 0.15 && baseDialLevel < 3) {
      effectiveDialLevel = Math.min(3, baseDialLevel + 0.2)
      adjustmentReasons.push('LOW_ANSWER_RATE_ADAPTIVE_INCREASE')
    } else if (answerRate > 0.55 && baseDialLevel > 1) {
      effectiveDialLevel = Math.max(1, baseDialLevel - 0.2)
      adjustmentReasons.push('HIGH_ANSWER_RATE_ADAPTIVE_REDUCTION')
    }
  }

  const raw = Math.ceil(readyAgents * effectiveDialLevel * safetyMultiplier)
  const perAgentCap = Math.ceil(readyAgents * maxCallsPerReadyAgent)
  const cap = Math.min(perAgentCap, simultaneousCap)
  const recommendedDialCount = Math.max(0, Math.min(raw, cap))
  const availableDialSlots = Math.max(0, recommendedDialCount - activeCalls)

  return {
    recommendedDialCount,
    availableDialSlots,
    cap,
    perAgentCap,
    simultaneousCap,
    raw,
    readyAgents,
    answerRate,
    abandonRate,
    maxAbandonRate,
    autoDialLevel: baseDialLevel,
    effectiveDialLevel,
    adaptiveDialEnabled,
    maxCallsPerReadyAgent,
    safetyMultiplier,
    adjustmentReasons,
    featureFlagRequired: false,
  }
}
