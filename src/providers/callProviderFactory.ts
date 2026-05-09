import { CallProvider } from '../interfaces/CallProvider'
import { TwilioProvider } from './TwilioProvider'

let providerInstance: CallProvider | null = null

/**
 * Returns a singleton CallProvider instance based on the CALL_PROVIDER
 * environment variable. Supported providers: `twilio` (default).
 *
 * Additional providers can be added by implementing the CallProvider
 * interface and extending this factory. See the project documentation
 * for details.
 */
export function getCallProvider(): CallProvider {
  if (providerInstance) return providerInstance
  const provider = (process.env.CALL_PROVIDER || 'twilio').toLowerCase()
  switch (provider) {
    case 'twilio':
      providerInstance = new TwilioProvider()
      break
    default:
      throw new Error(`Unsupported call provider: ${provider}`)
  }
  return providerInstance!
}