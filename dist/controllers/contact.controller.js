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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContactStats = exports.addToDNC = exports.uploadCSV = exports.deleteContact = exports.updateContact = exports.createContact = exports.getContactById = exports.getAllContacts = void 0;
const ContactService = __importStar(require("../services/contact.service"));
const response_1 = require("../utils/response");
const getAllContacts = async (req, res, next) => {
    try {
        const { campaignId, status, search, page, limit } = req.query;
        const result = await ContactService.getAllContacts({
            campaignId: campaignId ? Number(campaignId) : undefined,
            status: status,
            search: search,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 50,
        });
        return (0, response_1.sendSuccess)(res, result, 'Contacts fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getAllContacts = getAllContacts;
const getContactById = async (req, res, next) => {
    try {
        const contact = await ContactService.getContactById(Number(req.params.id));
        return (0, response_1.sendSuccess)(res, contact, 'Contact fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getContactById = getContactById;
const createContact = async (req, res, next) => {
    try {
        const contact = await ContactService.createContact(req.body);
        return (0, response_1.sendSuccess)(res, contact, 'Contact created successfully', 201);
    }
    catch (err) {
        return next(err);
    }
};
exports.createContact = createContact;
const updateContact = async (req, res, next) => {
    try {
        const contact = await ContactService.updateContact(Number(req.params.id), req.body);
        return (0, response_1.sendSuccess)(res, contact, 'Contact updated successfully');
    }
    catch (err) {
        return next(err);
    }
};
exports.updateContact = updateContact;
const deleteContact = async (req, res, next) => {
    try {
        await ContactService.deleteContact(Number(req.params.id));
        return (0, response_1.sendSuccess)(res, null, 'Contact deleted successfully');
    }
    catch (err) {
        return next(err);
    }
};
exports.deleteContact = deleteContact;
const uploadCSV = async (req, res, next) => {
    try {
        if (!req.file) {
            return (0, response_1.sendError)(res, 'No file uploaded', 400);
        }
        const campaignId = Number(req.params.campaignId);
        if (isNaN(campaignId)) {
            return (0, response_1.sendError)(res, 'Invalid campaign ID', 400);
        }
        const result = await ContactService.uploadCSV(campaignId, req.file.buffer);
        return (0, response_1.sendSuccess)(res, result, 'CSV uploaded successfully');
    }
    catch (err) {
        return next(err);
    }
};
exports.uploadCSV = uploadCSV;
const addToDNC = async (req, res, next) => {
    try {
        const { phone, reason } = req.body;
        if (!phone)
            return (0, response_1.sendError)(res, 'Phone number required', 400);
        const entry = await ContactService.addToDNC(phone, reason);
        return (0, response_1.sendSuccess)(res, entry, 'Number added to DNC list');
    }
    catch (err) {
        return next(err);
    }
};
exports.addToDNC = addToDNC;
const getContactStats = async (req, res, next) => {
    try {
        const { campaignId } = req.query;
        const stats = await ContactService.getContactStats(campaignId ? Number(campaignId) : undefined);
        return (0, response_1.sendSuccess)(res, stats, 'Contact stats fetched');
    }
    catch (err) {
        return next(err);
    }
};
exports.getContactStats = getContactStats;
//# sourceMappingURL=contact.controller.js.map