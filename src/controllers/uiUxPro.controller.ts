import { Request, Response } from 'express';
import { uiUxProService } from '../services/uiUxPro.service';

const ok = (res: Response, data: unknown, message = 'OK') =>
  res.json({
    success: true,
    message,
    data,
  });

const fail = (res: Response, error: unknown) =>
  res.status(400).json({
    success: false,
    message: error instanceof Error ? error.message : 'Request failed',
  });

export const uiUxProController = {
  overview(_req: Request, res: Response) {
    try {
      return ok(res, uiUxProService.getOverview(), 'UI/UX overview loaded');
    } catch (error) {
      return fail(res, error);
    }
  },

  updatePreferences(req: Request, res: Response) {
    try {
      return ok(res, uiUxProService.updatePreferences(req.body || {}), 'UI/UX preferences updated');
    } catch (error) {
      return fail(res, error);
    }
  },

  shortcuts(_req: Request, res: Response) {
    try {
      return ok(res, uiUxProService.getShortcuts(), 'Keyboard shortcuts loaded');
    } catch (error) {
      return fail(res, error);
    }
  },

  updateShortcuts(req: Request, res: Response) {
    try {
      return ok(res, uiUxProService.updateShortcuts(req.body?.shortcuts || []), 'Keyboard shortcuts updated');
    } catch (error) {
      return fail(res, error);
    }
  },

  miniCallBar(_req: Request, res: Response) {
    try {
      return ok(res, uiUxProService.getMiniCallBar(), 'Mini call bar loaded');
    } catch (error) {
      return fail(res, error);
    }
  },

  updateMiniCallBar(req: Request, res: Response) {
    try {
      return ok(res, uiUxProService.updateMiniCallBar(req.body || {}), 'Mini call bar updated');
    } catch (error) {
      return fail(res, error);
    }
  },

  triggerCelebration(req: Request, res: Response) {
    try {
      return ok(res, uiUxProService.triggerCelebration(req.body || {}), 'Celebration triggered');
    } catch (error) {
      return fail(res, error);
    }
  },

  clearCelebrations(_req: Request, res: Response) {
    try {
      return ok(res, uiUxProService.clearCelebrations(), 'Celebrations cleared');
    } catch (error) {
      return fail(res, error);
    }
  },
};
