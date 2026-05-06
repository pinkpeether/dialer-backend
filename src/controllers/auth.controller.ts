import { Request, Response, NextFunction } from 'express'
import * as AuthService from '../services/auth.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await AuthService.registerUser(req.body)
    return sendSuccess(res, result, 'User registered successfully', 201)
  } catch (err) {
    return next(err)
  }
}

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body
    const result = await AuthService.loginUser(email, password)
    return sendSuccess(res, result, 'Login successful')
  } catch (err) {
    return next(err)
  }
}

export const getProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await AuthService.getProfile(req.user!.id)
    return sendSuccess(res, user, 'Profile fetched')
  } catch (err) {
    return next(err)
  }
}

export const logout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    await AuthService.logoutUser(req.user!.id)
    return sendSuccess(res, null, 'Logged out successfully')
  } catch (err) {
    return next(err)
  }
}