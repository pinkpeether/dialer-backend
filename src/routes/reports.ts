import { Router } from 'express'
import * as ReportsController from '../controllers/reports.controller'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'))

// GET /api/reports/summary
router.get('/summary',    ReportsController.getSummary)

// GET /api/reports/calls?from=&to=&granularity=day
router.get('/calls',      ReportsController.getCallTrend)

// GET /api/reports/trend?from=&to=&granularity=day
// RC smoke compatibility alias for the same call trend payload.
router.get('/trend',      ReportsController.getCallTrend)

// GET /api/reports/campaigns
router.get('/campaigns',  ReportsController.getCampaignBreakdown)

// GET /api/reports/agents
router.get('/agents',     ReportsController.getAgentBreakdown)

export default router
