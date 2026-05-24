import Joi from 'joi'

export const createCampaignSchema = Joi.object({
  name:        Joi.string().min(2).max(100).required(),
  description: Joi.string().max(500).optional().allow(''),
  mode:        Joi.string().valid('MANUAL', 'PREVIEW', 'PROGRESSIVE', 'PREDICTIVE').default('PROGRESSIVE'),
  dialRatio:   Joi.number().min(1).max(10).default(3),
  dialingRatio: Joi.number().min(1).max(10).optional(),
  maxRetries:  Joi.number().min(0).max(10).default(3),
  retryDelay:  Joi.number().min(5).max(1440).default(30),
  script:      Joi.string().max(5000).optional().allow(''),
  startTime:   Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  endTime:     Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  timezone:    Joi.string().default('Asia/Karachi'),
})

export const updateCampaignSchema = Joi.object({
  name:        Joi.string().min(2).max(100).optional(),
  description: Joi.string().max(500).optional().allow(''),
  mode:        Joi.string().valid('MANUAL', 'PREVIEW', 'PROGRESSIVE', 'PREDICTIVE').optional(),
  dialRatio:   Joi.number().min(1).max(10).optional(),
  dialingRatio: Joi.number().min(1).max(10).optional(),
  maxRetries:  Joi.number().min(0).max(10).optional(),
  retryDelay:  Joi.number().min(5).max(1440).optional(),
  script:      Joi.string().max(5000).optional().allow(''),
  startTime:   Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  endTime:     Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  timezone:    Joi.string().optional(),
})
