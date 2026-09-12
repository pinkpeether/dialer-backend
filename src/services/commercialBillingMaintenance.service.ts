import logger from '../utils/logger'
import { callingBillingService } from './callingBilling.service'

const truthy = (value: unknown) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
const envNumber = (key: string, fallback: number) => {
  const parsed = Number(process.env[key])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

let cleanupTimer: NodeJS.Timeout | null = null
let cleanupRunning = false

export function startCommercialBillingMaintenance() {
  if (cleanupTimer || truthy(process.env.COMMERCIAL_BILLING_HOLD_CLEANUP_DISABLED)) return

  const intervalMs = envNumber('COMMERCIAL_BILLING_HOLD_CLEANUP_INTERVAL_MS', 5 * 60 * 1000)
  const olderThanMinutes = envNumber('COMMERCIAL_BILLING_HOLD_STALE_MINUTES', 240)
  const limit = envNumber('COMMERCIAL_BILLING_HOLD_CLEANUP_LIMIT', 50)

  cleanupTimer = setInterval(() => {
    if (cleanupRunning) return
    cleanupRunning = true
    void callingBillingService.releaseStaleHeldAuthorizations({ olderThanMinutes, limit })
      .then(result => {
        if (result.settled || result.released) {
          logger.info(`Commercial billing stale-hold cleanup settled=${result.settled} released=${result.released} scanned=${result.scanned}`)
        }
      })
      .catch(error => {
        logger.warn(`Commercial billing stale-hold cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        cleanupRunning = false
      })
  }, intervalMs)

  cleanupTimer.unref?.()
  logger.info(`Commercial billing stale-hold cleanup enabled: intervalMs=${intervalMs} olderThanMinutes=${olderThanMinutes}`)
}
