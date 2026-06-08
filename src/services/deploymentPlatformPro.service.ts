import fs from 'fs'
import path from 'path'

export type ReadinessStatus = 'READY' | 'CONFIGURED' | 'MISSING' | 'WARNING' | 'OPTIONAL'

export interface ReadinessItem {
  key: string
  label: string
  status: ReadinessStatus
  detail: string
  action?: string
}

export interface ReadinessSection {
  key: string
  title: string
  summary: string
  status: ReadinessStatus
  items: ReadinessItem[]
}

const present = (value?: string | null) => Boolean(value && String(value).trim().length > 0)

const redact = (value?: string | null) => {
  if (!present(value)) return null
  const raw = String(value)
  if (raw.length <= 8) return '********'
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`
}

const statusRank: Record<ReadinessStatus, number> = {
  MISSING: 5,
  WARNING: 4,
  CONFIGURED: 3,
  READY: 2,
  OPTIONAL: 1,
}

const aggregateStatus = (items: ReadinessItem[]): ReadinessStatus => {
  if (items.some(item => item.status === 'MISSING')) return 'MISSING'
  if (items.some(item => item.status === 'WARNING')) return 'WARNING'
  if (items.some(item => item.status === 'CONFIGURED')) return 'CONFIGURED'
  if (items.some(item => item.status === 'READY')) return 'READY'
  return 'OPTIONAL'
}

const hasAny = (...keys: string[]) => keys.some(key => present(process.env[key]))

const getPackageInfo = () => {
  try {
    const packagePath = path.join(process.cwd(), 'package.json')
    const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    return {
      name: parsed.name || 'unknown',
      version: parsed.version || 'unknown',
      scripts: parsed.scripts || {},
      dependencies: parsed.dependencies || {},
      devDependencies: parsed.devDependencies || {},
    }
  } catch {
    return {
      name: 'unknown',
      version: 'unknown',
      scripts: {},
      dependencies: {},
      devDependencies: {},
    }
  }
}

const makeItem = (
  key: string,
  label: string,
  status: ReadinessStatus,
  detail: string,
  action?: string
): ReadinessItem => ({ key, label, status, detail, action })

export const getDeploymentPlatformOverview = () => {
  const pkg = getPackageInfo()
  const nodeEnv = process.env.NODE_ENV || 'development'
  const apiBase = process.env.API_PUBLIC_URL || process.env.BASE_URL || process.env.WEBHOOK_BASE_URL || null
  const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || null
  const pbxWssUrl = process.env.PBX_WSS_URL || process.env.SIP_WSS_URL || process.env.SIP_WS_URL || 'wss://pbx.ptdt.taxi:8089/ws'

  const sections: ReadinessSection[] = [
    {
      key: 'cloud-hosting',
      title: 'Cloud hosting / Railway readiness',
      summary: 'Backend, frontend, database, CORS, and environment readiness for hosted pilot deployment.',
      status: 'OPTIONAL',
      items: [
        makeItem(
          'node-env',
          'NODE_ENV',
          nodeEnv === 'production' ? 'READY' : 'WARNING',
          `Current NODE_ENV is ${nodeEnv}.`,
          nodeEnv === 'production' ? undefined : 'Set NODE_ENV=production on Railway backend before final pilot freeze.'
        ),
        makeItem(
          'database-url',
          'DATABASE_URL',
          present(process.env.DATABASE_URL) ? 'READY' : 'MISSING',
          present(process.env.DATABASE_URL) ? `Configured: ${redact(process.env.DATABASE_URL)}` : 'DATABASE_URL is not configured.',
          'Configure Supabase/Railway PostgreSQL DATABASE_URL.'
        ),
        makeItem(
          'direct-url',
          'DIRECT_URL',
          present(process.env.DIRECT_URL) ? 'READY' : 'WARNING',
          present(process.env.DIRECT_URL) ? `Configured: ${redact(process.env.DIRECT_URL)}` : 'DIRECT_URL is not configured.',
          'Recommended for Prisma migrations against Supabase.'
        ),
        makeItem(
          'jwt-secret',
          'JWT_SECRET',
          present(process.env.JWT_SECRET) ? 'READY' : 'MISSING',
          present(process.env.JWT_SECRET) ? `Configured: ${redact(process.env.JWT_SECRET)}` : 'JWT_SECRET is missing.',
          'Set a strong JWT_SECRET before production pilot.'
        ),
        makeItem(
          'cors-origin',
          'FRONTEND_URL / CORS_ORIGIN',
          present(frontendUrl) ? 'READY' : 'WARNING',
          present(frontendUrl) ? `Configured: ${frontendUrl}` : 'Frontend origin is not configured.',
          'Set FRONTEND_URL and CORS_ORIGIN to Railway frontend URL and local/Electron-safe origins if needed.'
        ),
        makeItem(
          'api-public-url',
          'API public URL',
          present(apiBase) ? 'READY' : 'WARNING',
          present(apiBase) ? `Configured: ${apiBase}` : 'API public URL was not detected.',
          'Set API_PUBLIC_URL or BASE_URL / WEBHOOK_BASE_URL for callbacks and generated links.'
        ),
      ],
    },
    {
      key: 'public-pbx',
      title: 'Public PBX / VPS readiness',
      summary: 'FreePBX/Asterisk public server requirements for desktop SIP and Android/browser WSS calling.',
      status: 'OPTIONAL',
      items: [
        makeItem(
          'pbx-domain',
          'PBX domain',
          present(process.env.PBX_DOMAIN) || pbxWssUrl.includes('pbx.ptdt.taxi') ? 'CONFIGURED' : 'MISSING',
          `Expected PBX domain/WSS endpoint: ${pbxWssUrl}`,
          'Point pbx.ptdt.taxi DNS A record to public VPS IP.'
        ),
        makeItem(
          'pbx-wss',
          'WSS endpoint',
          pbxWssUrl.toLowerCase().endsWith('/ws') && pbxWssUrl.startsWith('wss://') ? 'CONFIGURED' : 'WARNING',
          `Configured/detected WSS: ${pbxWssUrl}`,
          'Use lowercase endpoint: wss://pbx.ptdt.taxi:8089/ws'
        ),
        makeItem(
          'pbx-cert',
          'Trusted SSL certificate',
          present(process.env.PBX_SSL_CERT_READY) ? 'READY' : 'WARNING',
          present(process.env.PBX_SSL_CERT_READY) ? 'PBX SSL certificate marked ready.' : 'PBX SSL readiness flag not set.',
          'Install a trusted LetsEncrypt/public cert for pbx.ptdt.taxi on Asterisk HTTP/WSS.'
        ),
        makeItem(
          'pbx-firewall',
          'PBX firewall / ports',
          present(process.env.PBX_FIREWALL_READY) ? 'READY' : 'WARNING',
          present(process.env.PBX_FIREWALL_READY) ? 'PBX firewall readiness flag set.' : 'PBX firewall readiness flag not set.',
          'Open TCP 8089, SIP ports, and RTP range only as required; restrict admin panel access.'
        ),
      ],
    },
    {
      key: 'sip-trunk',
      title: 'SIP trunk / outbound calling readiness',
      summary: 'Provider, prepaid balance, DID/CLI, and outbound route readiness.',
      status: 'OPTIONAL',
      items: [
        makeItem(
          'sip-provider',
          'SIP trunk provider',
          hasAny('SIP_TRUNK_PROVIDER', 'CALL_PROVIDER', 'SIP_TRUNK_ACCOUNT_ID') ? 'CONFIGURED' : 'MISSING',
          hasAny('SIP_TRUNK_PROVIDER', 'CALL_PROVIDER', 'SIP_TRUNK_ACCOUNT_ID') ? 'Provider-related variables detected.' : 'No SIP trunk provider variable detected.',
          'Configure SIP trunk/provider account on PBX and backend provider metadata.'
        ),
        makeItem(
          'calling-credit',
          'Calling credit / prepaid balance',
          present(process.env.SIP_TRUNK_BALANCE_READY) || present(process.env.SIP_TRUNK_ACCOUNT_ID) ? 'CONFIGURED' : 'WARNING',
          present(process.env.SIP_TRUNK_BALANCE_READY) ? 'Calling credit marked ready.' : 'Calling credit readiness flag not set.',
          'Top up SIP trunk balance before client pilot calls.'
        ),
        makeItem(
          'caller-id',
          'Verified caller ID / DID',
          present(process.env.DEFAULT_OUTBOUND_CALLER_ID) || present(process.env.DEFAULT_OUTBOUND_CALLER_ID) ? 'CONFIGURED' : 'WARNING',
          present(process.env.DEFAULT_OUTBOUND_CALLER_ID) || present(process.env.DEFAULT_OUTBOUND_CALLER_ID) ? 'Caller ID variable detected.' : 'No default outbound caller ID detected.',
          'Verify at least one DID/CLI and test outbound route.'
        ),
      ],
    },
    {
      key: 'desktop-release',
      title: 'Desktop app release readiness',
      summary: 'macOS DMG, Windows EXE, Linux package, code signing, notarization, and auto-update readiness.',
      status: 'OPTIONAL',
      items: [
        makeItem(
          'mac-dmg',
          'macOS DMG',
          'CONFIGURED',
          'macOS DMG build flow is available in the frontend project.',
          'Run final DMG smoke after every frontend production freeze.'
        ),
        makeItem(
          'windows-exe',
          'Windows EXE installer',
          'CONFIGURED',
          'Windows EXE build flow is available in the frontend project.',
          'Use installer EXE for client deployment; win-unpacked is for portable/debug use.'
        ),
        makeItem(
          'linux-build',
          'Linux app build/test',
          present(process.env.LINUX_RELEASE_READY) ? 'READY' : 'OPTIONAL',
          present(process.env.LINUX_RELEASE_READY) ? 'Linux release marked ready.' : 'Linux release is optional/not yet smoke-tested.',
          'Add AppImage/deb smoke later if Linux client appears.'
        ),
        makeItem(
          'code-signing',
          'Code signing / notarization',
          hasAny('APPLE_TEAM_ID', 'CSC_LINK', 'WINDOWS_CERTIFICATE_PASSWORD') ? 'CONFIGURED' : 'OPTIONAL',
          hasAny('APPLE_TEAM_ID', 'CSC_LINK', 'WINDOWS_CERTIFICATE_PASSWORD') ? 'Signing-related variables detected.' : 'Code signing not configured; acceptable for hand-deployed 1-month pilot.',
          'Add Apple Developer Program / Windows code signing when scaling beyond hand deployment.'
        ),
        makeItem(
          'auto-update',
          'Electron auto-update',
          hasAny('ELECTRON_UPDATE_URL', 'GH_TOKEN', 'UPDATE_SERVER_URL') ? 'CONFIGURED' : 'OPTIONAL',
          hasAny('ELECTRON_UPDATE_URL', 'GH_TOKEN', 'UPDATE_SERVER_URL') ? 'Auto-update variables detected.' : 'Auto-update not configured yet.',
          'Add signed release feed only after stable pilot build.'
        ),
      ],
    },
    {
      key: 'mobile-web',
      title: 'Mobile web / Android readiness',
      summary: 'Responsive UI, Android browser access, and SIP WSS limitation tracking.',
      status: 'OPTIONAL',
      items: [
        makeItem(
          'responsive-ui',
          'Mobile responsive UI',
          'READY',
          'Sprint 12F responsive frontend work has been completed and verified by pilot smoke.',
          'Keep route-level mobile smoke in every release checklist.'
        ),
        makeItem(
          'android-sip',
          'Android browser SIP calling',
          present(process.env.ANDROID_WSS_READY) ? 'READY' : 'WARNING',
          present(process.env.ANDROID_WSS_READY) ? 'Android WSS readiness marked ready.' : 'Android browser SIP calling depends on public PBX WSS/cert/ports.',
          'Retest after public VPS/FreePBX WSS setup is live.'
        ),
      ],
    },
  ].map(section => ({ ...section, status: aggregateStatus(section.items) }))

  const totals = sections.reduce<Record<ReadinessStatus, number>>((acc, section) => {
    section.items.forEach(item => {
      acc[item.status] = (acc[item.status] || 0) + 1
    })
    return acc
  }, { READY: 0, CONFIGURED: 0, MISSING: 0, WARNING: 0, OPTIONAL: 0 })

  const overallStatus = sections
    .map(section => section.status)
    .sort((a, b) => statusRank[b] - statusRank[a])[0] || 'OPTIONAL'

  return {
    generatedAt: new Date().toISOString(),
    package: pkg,
    overallStatus,
    totals,
    sections,
    recommendedNextSprint: 'Phase 4 Sprint 13 — Public PBX/VPS + SIP Trunk Production Telephony Setup',
  }
}

export const getDeploymentPlatformChecklist = () => {
  return {
    title: 'PTDT Dialer Deployment / Platform Final Checklist',
    generatedAt: new Date().toISOString(),
    checklist: [
      {
        group: 'Railway / Supabase',
        items: [
          'Railway backend latest deploy is green.',
          'Railway frontend latest deploy is green.',
          'Backend /api/health returns success true.',
          'DATABASE_URL and DIRECT_URL are set correctly.',
          'JWT_SECRET is strong and not committed anywhere.',
          'CORS_ORIGIN includes production frontend URL only plus approved dev origins.',
        ],
      },
      {
        group: 'PBX / VPS / SIP',
        items: [
          'pbx.ptdt.taxi DNS A record points to public VPS.',
          'FreePBX/Asterisk installed and secured.',
          'Valid SSL certificate installed for WSS.',
          'wss://pbx.ptdt.taxi:8089/ws responds with trusted certificate.',
          'SIP trunk registered and outbound route works.',
          'At least one verified outbound caller ID / DID is active.',
          'FreePBX recording ingest hook posts recordings to backend successfully.',
        ],
      },
      {
        group: 'Desktop Release',
        items: [
          'Mac DMG rebuilt from latest main.',
          'Windows setup EXE rebuilt from latest main.',
          'Mac install/login/logout/page smoke passed.',
          'Windows install/login/logout/page smoke passed.',
          'About dialog displays final dedication/copyright text.',
          'If distributing publicly, code signing/notarization plan is ready.',
        ],
      },
      {
        group: 'Mobile Web',
        items: [
          'Android Chrome login works against production frontend/backend.',
          'Dashboard/Dialer/SIP Settings/Reports/Contacts/Campaigns responsive smoke passed.',
          'Android SIP WSS limitation is documented until public PBX setup is complete.',
        ],
      },
    ],
  }
}

export const getDeploymentSmokeCommands = () => {
  const backendUrl = process.env.API_PUBLIC_URL || process.env.WEBHOOK_BASE_URL || 'https://dialer-backend-production-2a23.up.railway.app/api'
  const frontendUrl = process.env.FRONTEND_URL || 'https://dialer-frontend-production.up.railway.app'
  const pbxWssUrl = process.env.PBX_WSS_URL || 'wss://pbx.ptdt.taxi:8089/ws'

  return {
    generatedAt: new Date().toISOString(),
    commands: [
      {
        title: 'Backend health',
        command: `curl -i ${backendUrl.replace(/\/$/, '')}/health`,
      },
      {
        title: 'Frontend open',
        command: `open ${frontendUrl}`,
      },
      {
        title: 'PBX WSS certificate / reachability',
        command: `curl -vk ${pbxWssUrl.replace('wss://', 'https://')}`,
      },
      {
        title: 'Mac build smoke',
        command: 'cd /Volumes/iMac_Zee_HD2/dialer-frontend && npm run lint && npm run build && npm run electron:build:mac',
      },
      {
        title: 'Windows build smoke',
        command: 'cd /Volumes/iMac_Zee_HD2/dialer-frontend && npm run lint && npm run build && npm run electron:build:win',
      },
      {
        title: 'Backend build smoke',
        command: 'cd /Volumes/iMac_Zee_HD2/dialer-backend && npm run build',
      },
    ],
  }
}
