import os from 'os'
import prisma from '../lib/prisma'
import { getMonitoringSummary } from './monitoring.service'
import { getRecordingStorageHealth } from './recording.service'

const envPresent = (name: string) => Boolean(process.env[name])

const checkDb = async () => {
  const started = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - started }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message.slice(0, 300) : 'Unknown DB error',
    }
  }
}

const safePackageVersion = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json')
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

export const getSupportDiagnostics = async () => {
  const [dbResult, monitoringResult, recordingsResult] = await Promise.allSettled([
    checkDb(),
    getMonitoringSummary(),
    getRecordingStorageHealth(),
  ])

  const db = dbResult.status === 'fulfilled'
    ? dbResult.value
    : {
        ok: false,
        latencyMs: 0,
        error: dbResult.reason instanceof Error ? dbResult.reason.message.slice(0, 300) : 'DB check failed',
      }

  const monitoring = monitoringResult.status === 'fulfilled' ? monitoringResult.value : null
  const monitoringError = monitoringResult.status === 'rejected'
    ? monitoringResult.reason instanceof Error
      ? monitoringResult.reason.message.slice(0, 300)
      : 'Monitoring snapshot failed'
    : null

  const recordings = recordingsResult.status === 'fulfilled' ? recordingsResult.value : null
  const recordingsError = recordingsResult.status === 'rejected'
    ? recordingsResult.reason instanceof Error
      ? recordingsResult.reason.message.slice(0, 300)
      : 'Recording health snapshot failed'
    : null

  return {
    generatedAt: new Date().toISOString(),
    product: 'PTDT-Dialer',
    backend: {
      version: safePackageVersion(),
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.round(process.uptime()),
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      host: {
        hostname: os.hostname(),
        loadAverage: os.loadavg(),
        cpus: os.cpus()?.length || null,
      },
    },
    db,
    monitoring,
    monitoringError,
    recordings,
    recordingsError,
    envPresence: {
      DATABASE_URL: envPresent('DATABASE_URL'),
      JWT_SECRET: envPresent('JWT_SECRET'),
      API_PUBLIC_URL: envPresent('API_PUBLIC_URL'),
      BACKEND_PUBLIC_URL: envPresent('BACKEND_PUBLIC_URL'),
      RECORDING_ACCESS_SECRET: envPresent('RECORDING_ACCESS_SECRET'),
      RECORDING_ACCESS_TTL_SECONDS: envPresent('RECORDING_ACCESS_TTL_SECONDS'),
      SIP_TRUNK_ACCOUNT_ID: envPresent('SIP_TRUNK_ACCOUNT_ID'),
      SIP_TRUNK_API_KEY: envPresent('SIP_TRUNK_API_KEY'),
      SIP_TRUNK_API_SECRET: envPresent('SIP_TRUNK_API_SECRET'),
      PBX_APP_ID: envPresent('PBX_APP_ID'),
      FRONTEND_URL: envPresent('FRONTEND_URL'),
      CORS_ORIGIN: envPresent('CORS_ORIGIN'),
    },
  }
}
