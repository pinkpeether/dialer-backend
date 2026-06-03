export type GuardrailInput = {
  campaignId: number
  abandonmentRate: number
  maxAbandonmentRate?: number
  hasDncViolations?: boolean
  hasRetryViolations?: boolean
}

export const evaluateAbandonmentGuardrails = (input: GuardrailInput) => {
  const maxAbandonmentRate = input.maxAbandonmentRate ?? 0.03
  const violations: string[] = []

  if (input.abandonmentRate > maxAbandonmentRate) violations.push('ABANDONMENT_RATE_EXCEEDED')
  if (input.hasDncViolations) violations.push('DNC_VIOLATION_DETECTED')
  if (input.hasRetryViolations) violations.push('RETRY_WINDOW_VIOLATION_DETECTED')

  return {
    campaignId: input.campaignId,
    safe: violations.length === 0,
    shouldPause: violations.length > 0,
    violations,
    maxAbandonmentRate,
    abandonmentRate: input.abandonmentRate,
  }
}
