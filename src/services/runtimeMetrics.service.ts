type HttpMetric = {
  timestamp: string
  method: string
  path: string
  statusCode: number
  durationMs: number
}

type RuntimeErrorMetric = {
  timestamp: string
  method?: string
  path?: string
  statusCode?: number
  message: string
  type: 'POOL_TIMEOUT' | 'ERROR'
}

const MAX_HTTP_METRICS = 250
const MAX_ERROR_METRICS = 100

const state = {
  startedAt: new Date(),
  httpRequests: [] as HttpMetric[],
  runtimeErrors: [] as RuntimeErrorMetric[],
  totalRequests: 0,
  total5xx: 0,
  poolTimeouts: 0,
}

const pushLimited = <T>(items: T[], item: T, max: number) => {
  items.unshift(item)
  if (items.length > max) items.length = max
}

const isPoolTimeoutMessage = (message: string) => {
  const text = message.toLowerCase()
  return (
    text.includes('connection pool') ||
    text.includes('timed out fetching a new connection') ||
    text.includes('p2024')
  )
}

export const recordHttpRequest = (metric: Omit<HttpMetric, 'timestamp'>) => {
  state.totalRequests += 1
  if (metric.statusCode >= 500) state.total5xx += 1

  pushLimited(state.httpRequests, {
    ...metric,
    timestamp: new Date().toISOString(),
  }, MAX_HTTP_METRICS)
}

export const recordRuntimeError = (
  err: unknown,
  context?: { method?: string; path?: string; statusCode?: number }
) => {
  const message = err instanceof Error ? err.message : String(err || 'Unknown error')
  const poolTimeout = isPoolTimeoutMessage(message)
  if (poolTimeout) state.poolTimeouts += 1

  pushLimited(state.runtimeErrors, {
    timestamp: new Date().toISOString(),
    method: context?.method,
    path: context?.path,
    statusCode: context?.statusCode,
    message: message.slice(0, 500),
    type: poolTimeout ? 'POOL_TIMEOUT' : 'ERROR',
  }, MAX_ERROR_METRICS)
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[index]
}

export const getRuntimeMetricsSnapshot = () => {
  const durations = state.httpRequests.map(req => req.durationMs)
  const recent5xx = state.httpRequests.filter(req => req.statusCode >= 500).length
  const recentRequests = state.httpRequests.length
  const averageMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0

  return {
    startedAt: state.startedAt.toISOString(),
    uptimeSeconds: Math.round((Date.now() - state.startedAt.getTime()) / 1000),
    totalRequests: state.totalRequests,
    total5xx: state.total5xx,
    poolTimeouts: state.poolTimeouts,
    recent: {
      requestCount: recentRequests,
      error5xxCount: recent5xx,
      errorRatePercent: recentRequests > 0 ? Math.round((recent5xx / recentRequests) * 100) : 0,
      averageLatencyMs: averageMs,
      p95LatencyMs: percentile(durations, 95),
    },
    recentRequests: state.httpRequests.slice(0, 30),
    recentErrors: state.runtimeErrors.slice(0, 20),
  }
}

export const resetRuntimeMetrics = () => {
  state.startedAt = new Date()
  state.httpRequests = []
  state.runtimeErrors = []
  state.totalRequests = 0
  state.total5xx = 0
  state.poolTimeouts = 0
}
