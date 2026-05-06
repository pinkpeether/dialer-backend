"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendError = exports.sendSuccess = void 0;
const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};
exports.sendSuccess = sendSuccess;
const sendError = (res, message = 'Something went wrong', statusCode = 500, errors) => {
    return res.status(statusCode).json({
        success: false,
        message,
        errors: errors || null,
    });
};
exports.sendError = sendError;
//# sourceMappingURL=response.js.map