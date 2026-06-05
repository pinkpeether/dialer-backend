import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as ReportsAnalyticsProController from '../controllers/reportsAnalyticsPro.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/overview', ReportsAnalyticsProController.overview)
router.get('/agents/performance', ReportsAnalyticsProController.agentPerformance)
router.get('/hourly', ReportsAnalyticsProController.hourlyAnalytics)
router.get('/conversions', ReportsAnalyticsProController.conversionReport)
router.get('/duration', ReportsAnalyticsProController.durationAnalysis)
router.get('/missed-calls', ReportsAnalyticsProController.missedCallReport)
router.get('/daily-summary-email/preview', ReportsAnalyticsProController.dailySummaryEmailPreview)
router.post('/daily-summary-email/send', ReportsAnalyticsProController.sendDailySummaryEmail)
router.get('/campaigns/:campaignId/pdf', ReportsAnalyticsProController.campaignPdf)
router.get('/export/csv', ReportsAnalyticsProController.exportCsv)

export default router
