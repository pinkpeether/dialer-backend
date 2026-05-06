import { Router } from 'express'
import * as AuthController from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { registerSchema, loginSchema } from '../validators/auth.validator'

const router = Router()

// Public routes
router.post('/register', validate(registerSchema), AuthController.register)
router.post('/login',    validate(loginSchema),    AuthController.login)

// Protected routes
router.get('/profile', authenticate, AuthController.getProfile)
router.post('/logout', authenticate, AuthController.logout)

export default router