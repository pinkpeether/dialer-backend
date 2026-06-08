import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth'
import * as RecordingStorageProController from '../controllers/recordingStoragePro.controller'

const router = Router()

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/overview', RecordingStorageProController.overview)
router.get('/search', RecordingStorageProController.search)
router.get('/export.csv', RecordingStorageProController.exportCsv)

router.get('/calls/:callId/download-info', RecordingStorageProController.downloadInfo)
router.get('/calls/:callId/download', RecordingStorageProController.redirectDownload)

router.get('/retention-policy', RecordingStorageProController.getRetentionPolicy)
router.put('/retention-policy', RecordingStorageProController.updateRetentionPolicy)
router.post('/retention-policy/preview-purge', RecordingStorageProController.previewPurge)
router.post('/retention-policy/run-purge', RecordingStorageProController.runPurge)

export default router
