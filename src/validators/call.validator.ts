import Joi from 'joi'

export const updateDispositionSchema = Joi.object({
  disposition: Joi.string()
    .valid('ANSWERED', 'NO_ANSWER', 'VOICEMAIL', 'CALLBACK', 'WRONG_NUMBER', 'DO_NOT_CALL')
    .required(),
  notes: Joi.string().trim().max(500).allow('').optional(),
})
