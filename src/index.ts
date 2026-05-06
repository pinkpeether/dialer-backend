import 'dotenv/config'
import { httpServer } from './app'
import logger from './utils/logger'

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  logger.info(`🚀 JD Dialer Backend running on http://localhost:${PORT}`)
})