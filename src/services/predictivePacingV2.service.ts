export type PacingInput = {
  readyAgents: number
  answerRate: number
  maxCallsPerReadyAgent?: number
  safetyMultiplier?: number
}

export const calculatePredictivePacingV2 = (input: PacingInput) => {
  const readyAgents = Math.max(0, Math.floor(input.readyAgents || 0))
  const answerRate = Math.max(0.01, Math.min(1, input.answerRate || 0.1))
  const maxCallsPerReadyAgent = Math.max(1, Math.min(5, input.maxCallsPerReadyAgent || 2))
  const safetyMultiplier = Math.max(0.5, Math.min(1.5, input.safetyMultiplier || 0.85))

  const raw = Math.ceil((readyAgents / answerRate) * safetyMultiplier)
  const cap = readyAgents * maxCallsPerReadyAgent
  const recommendedDialCount = Math.max(0, Math.min(raw, cap))

  return {
    recommendedDialCount,
    cap,
    raw,
    readyAgents,
    answerRate,
    maxCallsPerReadyAgent,
    safetyMultiplier,
    featureFlagRequired: true,
  }
}
