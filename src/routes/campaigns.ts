import { Router } from 'express';
import * as CampaignController from '../controllers/campaign.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createCampaignSchema,
  updateCampaignSchema,
} from '../validators/campaign.validator';
import Joi from 'joi';
import { queueManager } from '../services/queueManager';

const router = Router();

router.use(authenticate);

// Stats
router.get(
  '/stats',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignController.getCampaignStats,
);

// List all
router.get(
  '/',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignController.getAllCampaigns,
);

// Single campaign
router.get(
  '/:id',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignController.getCampaignById,
);

// Create
router.post(
  '/',
  authorize('ADMIN', 'SUPERVISOR'),
  validate(createCampaignSchema),
  CampaignController.createCampaign,
);

// Update
router.put(
  '/:id',
  authorize('ADMIN', 'SUPERVISOR'),
  validate(updateCampaignSchema),
  CampaignController.updateCampaign,
);

// Delete
router.delete(
  '/:id',
  authorize('ADMIN'),
  CampaignController.deleteCampaign,
);

// Status change (start/pause/complete)
router.patch(
  '/:id/status',
  authorize('ADMIN', 'SUPERVISOR'),
  validate(
    Joi.object({
      status: Joi.string()
        .valid('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')
        .required(),
    }),
  ),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body as { status: string };

      // When campaign is started (ACTIVE) → init queue
      if (status === 'ACTIVE') {
        await queueManager.initQueue(parseInt(id, 10));
      }

      // When campaign is paused or completed → clear queue + reset contacts
      if (status === 'PAUSED' || status === 'COMPLETED') {
        await queueManager.clear(parseInt(id, 10));
      }

      return CampaignController.updateCampaignStatus(req, res, next);
    } catch (err) {
      next(err);
    }
  },
);

// Clone campaign
router.post(
  '/:id/clone',
  authorize('ADMIN', 'SUPERVISOR'),
  CampaignController.cloneCampaign,
);

export default router;