"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCallProvider = getCallProvider;
const TwilioProvider_1 = require("./TwilioProvider");
let providerInstance = null;
/**
 * Returns a singleton CallProvider instance based on the CALL_PROVIDER
 * environment variable. Supported providers: `twilio` (default).
 *
 * Additional providers can be added by implementing the CallProvider
 * interface and extending this factory. See the project documentation
 * for details.
 */
function getCallProvider() {
    if (providerInstance)
        return providerInstance;
    const provider = (process.env.CALL_PROVIDER || 'twilio').toLowerCase();
    switch (provider) {
        case 'twilio':
            providerInstance = new TwilioProvider_1.TwilioProvider();
            break;
        default:
            throw new Error(`Unsupported call provider: ${provider}`);
    }
    return providerInstance;
}
//# sourceMappingURL=callProviderFactory.js.map