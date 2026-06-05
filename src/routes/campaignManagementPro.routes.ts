import { Router } from 'express'
import multer from 'multer'
import { authenticate, authorize } from '../middleware/auth'
import * as CampaignManagementProController from '../controllers/campaignManagementPro.controller'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

router.use(authenticate)

router.get('/campaigns/:campaignId/summary',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignManagementProController.summary,
)

router.get('/campaigns/:campaignId/script',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CampaignManagementProController.getScript,
)

router.put('/campaigns/:campaignId/script',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignManagementProController.updateScript,
)

router.post('/campaigns/:campaignId/script/popup',
  authorize('ADMIN', 'SUPERVISOR', 'AGENT'),
  CampaignManagementProController.scriptPopup,
)

router.post('/campaigns/:campaignId/clone',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignManagementProController.cloneCampaign,
)

router.post('/campaigns/:campaignId/contacts/upload',
  authorize('ADMIN', 'SUPERVISOR'),
  upload.single('file'),
  CampaignManagementProController.uploadContacts,
)

router.get('/campaigns/:campaignId/dial-settings',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignManagementProController.getDialSettings,
)

router.put('/campaigns/:campaignId/dial-settings',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignManagementProController.updateDialSettings,
)

router.get('/campaigns/:campaignId/end-report.pdf',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignManagementProController.endReportPdf,
)

export default router
