import { CallProvider } from '../interfaces/CallProvider';
/**
 * Returns a singleton CallProvider instance based on the CALL_PROVIDER
 * environment variable. Supported providers: `twilio` (default).
 *
 * Additional providers can be added by implementing the CallProvider
 * interface and extending this factory. See the project documentation
 * for details.
 */
export declare function getCallProvider(): CallProvider;
//# sourceMappingURL=callProviderFactory.d.ts.map