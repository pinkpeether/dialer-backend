import type { CallProvider } from '../interfaces/CallProvider'
import { AppError } from '../middleware/errorHandler'

export function getCallProvider(): CallProvider {
  throw new AppError('Server-side call provider adapter is disabled. Use SIP/PBX runtime for calling.', 400)
}
