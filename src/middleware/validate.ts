import { Request, Response, NextFunction } from 'express'
import Joi from 'joi'
import { sendError } from '../utils/response'

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false })
    if (error) {
      const errors = error.details.map(d => d.message)
      return sendError(res, 'Validation failed', 422, errors)
    }
    return next()
  }
}