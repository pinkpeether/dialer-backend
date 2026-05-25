export const DIALING_MODES = {
  MANUAL: 'MANUAL',
  PREVIEW: 'PREVIEW',
  PROGRESSIVE: 'PROGRESSIVE',
  PREDICTIVE: 'PREDICTIVE',
} as const

export type DialingMode = typeof DIALING_MODES[keyof typeof DIALING_MODES]

export const normalizeDialingMode = (mode?: string | null): DialingMode => {
  const upper = String(mode || DIALING_MODES.PROGRESSIVE).toUpperCase()
  if (upper === DIALING_MODES.MANUAL) return DIALING_MODES.MANUAL
  if (upper === DIALING_MODES.PREVIEW) return DIALING_MODES.PREVIEW
  if (upper === DIALING_MODES.PREDICTIVE) return DIALING_MODES.PREDICTIVE
  return DIALING_MODES.PROGRESSIVE
}
