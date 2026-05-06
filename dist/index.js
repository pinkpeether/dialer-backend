"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const logger_1 = __importDefault(require("./utils/logger"));
const PORT = process.env.PORT || 3001;
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
    process.exit(1);
});
try {
    app_1.httpServer.listen(PORT, () => {
        console.log(`🚀 JD Dialer Backend running on port ${PORT}`);
        logger_1.default.info(`🚀 JD Dialer Backend running on http://localhost:${PORT}`);
    });
}
catch (err) {
    console.error('FAILED TO START SERVER:', err);
    process.exit(1);
}
//# sourceMappingURL=index.js.map