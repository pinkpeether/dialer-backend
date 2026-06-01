import { Router } from 'express'
import multer from 'multer'
import { authenticate, authorize } from '../middleware/auth'
import * as RecordingController from '../controllers/recording.controller'
import * as RecordingIngestController from '../controllers/recordingIngest.controller'

const router = Router()

const recordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = new Set([
      'audio/wav',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/webm',
      'audio/gsm',
      'application/octet-stream',
    ])

    const allowedExtensions = /\.(wav|mp3|mp4|webm|m4a|gsm)$/i

    if (allowedMimeTypes.has(file.mimetype) || allowedExtensions.test(file.originalname)) {
      cb(null, true)
      return
    }

    cb(new Error('Only audio recording files are allowed'))
  },
})

router.post('/ingest/freepbx', recordingUpload.single('file'), RecordingIngestController.ingestFreepbxRecording)

// Signed playback URL endpoint. Auth headers are not available to <audio>, so token verification is the auth.
router.get('/:callId/stream', RecordingController.stream)

router.use(authenticate)
router.use(authorize('ADMIN', 'SUPERVISOR'))

router.get('/health', RecordingController.health)
router.get('/', RecordingController.list)
router.get('/:callId', RecordingController.detail)
router.get('/:callId/access', RecordingController.access)

export default router
