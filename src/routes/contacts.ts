import { Router } from 'express'
import multer from 'multer'
import * as ContactController from '../controllers/contact.controller'
import { authenticate, authorize } from '../middleware/auth'
import { validate } from '../middleware/validate'
import {
  createContactSchema,
  updateContactSchema,
} from '../validators/contact.validator'

const router  = Router()
const upload  = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' ||
        file.originalname.endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV files are allowed'))
    }
  }
})

router.use(authenticate)

// Stats
router.get('/stats',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  ContactController.getContactStats
)

// List
router.get('/',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR', 'AGENT'),
  ContactController.getAllContacts
)

// Single
router.get('/:id/calls',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR', 'AGENT'),
  ContactController.getContactCalls
)

// Single
router.get('/:id',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR', 'AGENT'),
  ContactController.getContactById
)

// Manual add
router.post('/',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  validate(createContactSchema),
  ContactController.createContact
)

// CSV Upload
router.post('/upload/:campaignId',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  upload.single('file'),
  ContactController.uploadCSV
)

// Update
router.put('/:id',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  validate(updateContactSchema),
  ContactController.updateContact
)

// Delete
router.delete('/:id',
  authorize('ADMIN'),
  ContactController.deleteContact
)

// Add to DNC
router.post('/dnc',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  ContactController.addToDNC
)

export default router
