"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const logger_1 = __importDefault(require("./utils/logger"));
const PORT = process.env.PORT || 3001;
app_1.httpServer.listen(PORT, () => {
    logger_1.default.info(`🚀 JD Dialer Backend running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map