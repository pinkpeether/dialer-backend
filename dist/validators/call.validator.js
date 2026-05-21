"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDispositionSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.updateDispositionSchema = joi_1.default.object({
    disposition: joi_1.default.string()
        .valid('ANSWERED', 'NO_ANSWER', 'VOICEMAIL', 'CALLBACK', 'WRONG_NUMBER', 'DO_NOT_CALL')
        .required(),
    notes: joi_1.default.string().trim().max(500).allow('').optional(),
    callbackAt: joi_1.default.string().isoDate().optional(),
});
//# sourceMappingURL=call.validator.js.map