"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const ContactController = __importStar(require("../controllers/contact.controller"));
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const contact_validator_1 = require("../validators/contact.validator");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'text/csv' ||
            file.originalname.endsWith('.csv')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});
router.use(auth_1.authenticate);
// Stats
router.get('/stats', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), ContactController.getContactStats);
// List
router.get('/', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), ContactController.getAllContacts);
// Single
router.get('/:id', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), ContactController.getContactById);
// Manual add
router.post('/', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), (0, validate_1.validate)(contact_validator_1.createContactSchema), ContactController.createContact);
// CSV Upload
router.post('/upload/:campaignId', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), upload.single('file'), ContactController.uploadCSV);
// Update
router.put('/:id', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), (0, validate_1.validate)(contact_validator_1.updateContactSchema), ContactController.updateContact);
// Delete
router.delete('/:id', (0, auth_1.authorize)('ADMIN'), ContactController.deleteContact);
// Add to DNC
router.post('/dnc', (0, auth_1.authorize)('ADMIN', 'SUPERVISOR'), ContactController.addToDNC);
exports.default = router;
//# sourceMappingURL=contacts.js.map