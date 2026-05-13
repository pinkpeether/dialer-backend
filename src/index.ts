import 'dotenv/config'
import { httpServer } from './app'
import logger from './utils/logger'

const PORT = process.env.PORT || 3001

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason)
  process.exit(1)
})

try {
  httpServer.listen(PORT, () => {
    console.log(`🚀 PTDT Dialer Backend running on port ${PORT}`)
    logger.info(`🚀 PTDT Dialer Backend running on http://localhost:${PORT}`)
  })
} catch (err) {
  console.error('FAILED TO START SERVER:', err)
  process.exit(1)
}