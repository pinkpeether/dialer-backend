import { Request, Response } from 'express'
import * as notificationsAlertsProService from '../services/notificationsAlertsPro.service'

function getUser(req: Request) {
  const requestUser = (req as any).user || {}
  return {
    id: Number(requestUser.id || requestUser.userId || 0),
    role: String(requestUser.role || req.query.role || '').toUpperCase(),
  }
}

function sendSuccess(res: Response, data: unknown, message = 'OK') {
  return res.json({ success: true, message, data })
}

function sendError(res: Response, error: unknown) {
  const statusCode = Number((error as any)?.statusCode || 500)
  return res.status(statusCode).json({
    success: false,
    message: (error as Error)?.message || 'Notifications and alerts request failed',
  })
}

export async function getPreferences(req: Request, res: Response) {
  try {
    const user = getUser(req)
    const preferences = await notificationsAlertsProService.getAlertPreferences(user.id || 0)
    return sendSuccess(res, preferences, 'Alert preferences loaded')
  } catch (error) {
    return sendError(res, error)
  }
}

export async function updatePreferences(req: Request, res: Response) {
  try {
    const user = getUser(req)
    const preferences = await notificationsAlertsProService.updateAlertPreferences(user.id || 0, req.body || {})
    return sendSuccess(res, preferences, 'Alert preferences updated')
  } catch (error) {
    return sendError(res, error)
  }
}

export async function listAlerts(req: Request, res: Response) {
  try {
    const user = getUser(req)
    const alerts = await notificationsAlertsProService.listAlerts({
      userId: user.id,
      role: user.role,
      onlyUnread: String(req.query.onlyUnread || '') === 'true',
      severity: req.query.severity as string | undefined,
      type: req.query.type as string | undefined,
      limit: Number(req.query.limit || 100),
    })
    return sendSuccess(res, alerts, 'Alerts loaded')
  } catch (error) {
    return sendError(res, error)
  }
}

export async function getSummary(req: Request, res: Response) {
  try {
    const user = getUser(req)
    const summary = await notificationsAlertsProService.getAlertSummary({ userId: user.id, role: user.role })
    return sendSuccess(res, summary, 'Alert summary loaded')
  } catch (error) {
    return sendError(res, error)
  }
}

export async function createAlert(req: Request, res: Response) {
  try {
    const alert = await notificationsAlertsProService.createManualAlert(req.body || {})
    return sendSuccess(res, alert, 'Alert created')
  } catch (error) {
    return sendError(res, error)
  }
}

export async function acknowledgeAlert(req: Request, res: Response) {
  try {
    const user = getUser(req)
    const alert = await notificationsAlertsProService.acknowledgeAlert(req.params.alertId, user.id || 0)
    return sendSuccess(res, alert, 'Alert acknowledged')
  } catch (error) {
    return sendError(res, error)
  }
}

export async function acknowledgeAll(req: Request, res: Response) {
  try {
    const user = getUser(req)
    const result = await notificationsAlertsProService.acknowledgeAllAlerts(user.id || 0, user.role)
    return sendSuccess(res, result, 'All visible alerts acknowledged')
  } catch (error) {
    return sendError(res, error)
  }
}

export async function runSweep(req: Request, res: Response) {
  try {
    const result = await notificationsAlertsProService.runAlertSweep()
    return sendSuccess(res, result, 'Alert sweep completed')
  } catch (error) {
    return sendError(res, error)
  }
}

export async function createAngryCustomerAlert(req: Request, res: Response) {
  try {
    const alert = await notificationsAlertsProService.createAngryCustomerAlert(req.body || {})
    return sendSuccess(res, alert, 'Angry customer alert created')
  } catch (error) {
    return sendError(res, error)
  }
}

export async function createShiftReminder(req: Request, res: Response) {
  try {
    const alert = await notificationsAlertsProService.createShiftReminder(req.body || {})
    return sendSuccess(res, alert, 'Shift/break reminder created')
  } catch (error) {
    return sendError(res, error)
  }
}
