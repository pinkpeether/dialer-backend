import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth';
export declare const getAllCallbacks: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const createCallback: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const updateCallback: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=callback.controller.d.ts.map