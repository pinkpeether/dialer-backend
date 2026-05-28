export type PermissionReviewRoute = {
  method: string
  path: string
  frontendRoles: string[]
  backendRoles: string[]
  level: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'MATCHED' | 'REVIEW'
  note?: string
}

const routeMatrix: PermissionReviewRoute[] = [
  { method: 'GET', path: '/api/support/diagnostics/access-review', frontendRoles: ['ADMIN'], backendRoles: ['ADMIN'], level: 'HIGH', status: 'MATCHED' },
  { method: 'GET', path: '/api/audit-logs', frontendRoles: ['ADMIN'], backendRoles: ['ADMIN'], level: 'HIGH', status: 'MATCHED' },
  { method: 'GET/PATCH', path: '/api/settings', frontendRoles: ['ADMIN'], backendRoles: ['ADMIN'], level: 'HIGH', status: 'MATCHED' },
  { method: 'GET', path: '/api/monitoring/summary', frontendRoles: ['ADMIN', 'SUPERVISOR'], backendRoles: ['ADMIN', 'SUPERVISOR'], level: 'MEDIUM', status: 'MATCHED' },
  { method: 'POST', path: '/api/monitoring/runtime/reset', frontendRoles: ['ADMIN'], backendRoles: ['ADMIN'], level: 'MEDIUM', status: 'MATCHED' },
  { method: 'GET', path: '/api/support/diagnostics', frontendRoles: ['ADMIN', 'SUPERVISOR'], backendRoles: ['ADMIN', 'SUPERVISOR'], level: 'MEDIUM', status: 'MATCHED' },
  { method: 'GET', path: '/api/recordings', frontendRoles: ['ADMIN', 'SUPERVISOR'], backendRoles: ['ADMIN', 'SUPERVISOR'], level: 'MEDIUM', status: 'MATCHED' },
  { method: 'GET', path: '/api/ops', frontendRoles: ['ADMIN', 'SUPERVISOR'], backendRoles: ['ADMIN', 'SUPERVISOR'], level: 'MEDIUM', status: 'MATCHED' },
  { method: 'GET', path: '/api/campaigns', frontendRoles: ['ADMIN', 'MANAGER'], backendRoles: ['ADMIN', 'MANAGER'], level: 'MEDIUM', status: 'MATCHED' },
  { method: 'GET', path: '/api/calls', frontendRoles: ['ADMIN', 'MANAGER', 'SUPERVISOR', 'AGENT'], backendRoles: ['role-scoped'], level: 'MEDIUM', status: 'REVIEW', note: 'Confirm agent-scoped data during final QA.' },
]

export const getPermissionReview = () => {
  const reviewItems = routeMatrix.filter(route => route.status === 'REVIEW')
  const highItems = routeMatrix.filter(route => route.level === 'HIGH')

  return {
    generatedAt: new Date().toISOString(),
    status: reviewItems.length > 0 ? 'REVIEW_REQUIRED' : 'MATCHED',
    summary: {
      totalRoutes: routeMatrix.length,
      reviewItems: reviewItems.length,
      highItems: highItems.length,
    },
    routeMatrix,
    checks: {
      backendAuthorizationRequired: true,
      frontendOnlyProtectionAllowed: false,
      updaterAutoInstallAllowed: false,
    },
    notes: [
      'Admin-only final production permission review.',
      'Backend authorization remains the final authority.',
      'Any REVIEW row should be manually smoke-tested before final signoff.',
    ],
  }
}
