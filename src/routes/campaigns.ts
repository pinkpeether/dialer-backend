import { Router } from 'express';
import * as CampaignController from '../controllers/campaign.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createCampaignSchema,
  updateCampaignSchema,
} from '../validators/campaign.validator';
import Joi from 'joi';

const router = Router();

router.use(authenticate);

// Stats
router.get(
  '/stats',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  CampaignController.getCampaignStats,
);

// List all
router.get(
  '/',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  CampaignController.getAllCampaigns,
);

// Single campaign
router.get(
  '/:id',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  CampaignController.getCampaignById,
);

// Create
router.post(
  '/',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  validate(createCampaignSchema),
  CampaignController.createCampaign,
);

// Update
router.put(
  '/:id',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  validate(updateCampaignSchema),
  CampaignController.updateCampaign,
);

// Delete
router.delete(
  '/:id',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  CampaignController.deleteCampaign,
);

// Status change (start/pause/complete)
router.patch(
  '/:id/status',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  validate(
    Joi.object({
      status: Joi.string()
        .valid('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')
        .required(),
    }),
  ),
  CampaignController.updateCampaignStatus,
);

// Clone campaign
router.post(
  '/:id/clone',
  authorize('ADMIN', 'CUSTOMER_ADMIN', 'SUPERVISOR'),
  CampaignController.cloneCampaign,
);

export default router;