import Joi from 'joi'

export const createContactSchema = Joi.object({
  name:       Joi.string().min(1).max(100).required(),
  phone:      Joi.string().min(7).max(20).required(),
  email:      Joi.string().email().optional().allow(''),
  company:    Joi.string().max(100).optional().allow(''),
  notes:      Joi.string().max(1000).optional().allow(''),
  campaignId: Joi.number().integer().positive().required(),
})

export const updateContactSchema = Joi.object({
  name:    Joi.string().min(1).max(100).optional(),
  phone:   Joi.string().min(7).max(20).optional(),
  email:   Joi.string().email().optional().allow(''),
  company: Joi.string().max(100).optional().allow(''),
  notes:   Joi.string().max(1000).optional().allow(''),
  status:  Joi.string()
    .valid(
      'PENDING',
      'IN_QUEUE',
      'CALLING',
      'CONTACTED',
      'ANSWERED',
      'NO_ANSWER',
      'BUSY',
      'DONE',
      'FAILED',
      'VOICEMAIL',
      'CALLBACK',
      'WRONG_NUMBER',
      'DNC'
    )
    .optional(),
})
