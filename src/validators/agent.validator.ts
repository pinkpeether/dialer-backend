import Joi from 'joi'

export const createAgentSchema = Joi.object({
  name:      Joi.string().min(2).max(50).required(),
  email:     Joi.string().email().required(),
  password:  Joi.string().min(6).max(50).required(),
  role:      Joi.string().valid('ADMIN', 'SUPERVISOR', 'AGENT').default('AGENT'),
  extension: Joi.string().max(10).optional().allow(''),
  phone:     Joi.string().max(20).optional().allow(''),
})

export const updateAgentSchema = Joi.object({
  name:      Joi.string().min(2).max(50).optional(),
  email:     Joi.string().email().optional(),
  role:      Joi.string().valid('ADMIN', 'SUPERVISOR', 'AGENT').optional(),
  extension: Joi.string().max(10).optional().allow(''),
  phone:     Joi.string().max(20).optional().allow(''),
  isActive:  Joi.boolean().optional(),
})

export const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid('ONLINE', 'READY', 'BUSY', 'WRAP_UP', 'OFFLINE')
    .required(),
})

export const resetPasswordSchema = Joi.object({
  password: Joi.string().min(6).max(50).required(),
})