"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const response_1 = require("../utils/response");
const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, { abortEarly: false });
        if (error) {
            const errors = error.details.map(d => d.message);
            return (0, response_1.sendError)(res, 'Validation failed', 422, errors);
        }
        return next();
    };
};
exports.validate = validate;
//# sourceMappingURL=validate.js.map