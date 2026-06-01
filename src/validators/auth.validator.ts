import Joi from 'joi'

export const registerSchema = Joi.object({
  name:      Joi.string().min(2).max(50).required(),
  email:     Joi.string().email().required(),
  password:  Joi.string().min(6).max(50).required(),
  role:      Joi.string().valid('ADMIN', 'SUPERVISOR', 'AGENT').default('AGENT'),
  extension: Joi.string().max(10).optional(),
  phone:     Joi.string().max(20).optional(),
})

export const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
})

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(72).required(),
})
