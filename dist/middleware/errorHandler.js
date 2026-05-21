"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.AppError = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
function getStatusCode(err) {
    if (err instanceof AppError)
        return err.statusCode;
    return err.statusCode || err.status || 500;
}
const errorHandler = (err, req, res, _next) => {
    const statusCode = getStatusCode(err);
    const safeStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    const isProduction = process.env.NODE_ENV === 'production';
    const message = err.message || 'Internal Server Error';
    logger_1.default.error(`${req.method} ${req.originalUrl || req.path} — ${message}`);
    return res.status(safeStatusCode).json({
        success: false,
        message: isProduction && safeStatusCode === 500 ? 'Internal Server Error' : message,
        ...(isProduction ? {} : { stack: err.stack }),
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=errorHandler.js.map