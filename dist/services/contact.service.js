"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContactStats = exports.addToDNC = exports.uploadCSV = exports.deleteContact = exports.updateContact = exports.createContact = exports.getContactById = exports.getAllContacts = void 0;
const sync_1 = require("csv-parse/sync");
const prisma_1 = __importDefault(require("../lib/prisma"));
const errorHandler_1 = require("../middleware/errorHandler");
// ── Phone number normalizer ──
const normalizePhone = (phone) => {
    return phone.replace(/[\s\-\(\)\.]/g, '').trim();
};
// ── DNC check ──
const isDNC = async (phone) => {
    const entry = await prisma_1.default.dNCList.findUnique({
        where: { phone: normalizePhone(phone) }
    });
    return !!entry;
};
const getAllContacts = async (filters) => {
    const { campaignId, status, search, page = 1, limit = 50 } = filters;
    const where = {};
    if (campaignId)
        where.campaignId = campaignId;
    if (status)
        where.status = status;
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
            { company: { contains: search, mode: 'insensitive' } },
        ];
    }
    const [contacts, total] = await Promise.all([
        prisma_1.default.contact.findMany({
            where,
            select: {
                id: true, name: true, phone: true, email: true,
                company: true, status: true, retryCount: true,
                lastCalledAt: true, campaignId: true, createdAt: true,
                _count: { select: { calls: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma_1.default.contact.count({ where }),
    ]);
    return {
        contacts,
        pagination: {
            total, page, limit,
            totalPages: Math.ceil(total / limit),
        }
    };
};
exports.getAllContacts = getAllContacts;
const getContactById = async (id) => {
    const contact = await prisma_1.default.contact.findUnique({
        where: { id },
        include: {
            calls: {
                orderBy: { startedAt: 'desc' },
                take: 20,
                select: {
                    id: true, status: true, duration: true,
                    disposition: true, sentiment: true,
                    recordingUrl: true, startedAt: true, endedAt: true,
                    agent: { select: { name: true, agentCode: true } }
                }
            },
            campaign: { select: { id: true, name: true } }
        }
    });
    if (!contact)
        throw new errorHandler_1.AppError('Contact not found', 404);
    return contact;
};
exports.getContactById = getContactById;
const createContact = async (data) => {
    // Check campaign exists
    const campaign = await prisma_1.default.campaign.findUnique({
        where: { id: data.campaignId }
    });
    if (!campaign)
        throw new errorHandler_1.AppError('Campaign not found', 404);
    const phone = normalizePhone(data.phone);
    // DNC check
    if (await isDNC(phone)) {
        throw new errorHandler_1.AppError('This number is on the DNC list', 400);
    }
    // Duplicate check within same campaign
    const duplicate = await prisma_1.default.contact.findFirst({
        where: { phone, campaignId: data.campaignId }
    });
    if (duplicate)
        throw new errorHandler_1.AppError('Contact already exists in this campaign', 409);
    return await prisma_1.default.contact.create({
        data: { ...data, phone }
    });
};
exports.createContact = createContact;
const updateContact = async (id, data) => {
    const existing = await prisma_1.default.contact.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Contact not found', 404);
    if (data.phone)
        data.phone = normalizePhone(data.phone);
    return await prisma_1.default.contact.update({
        where: { id },
        data: data,
    });
};
exports.updateContact = updateContact;
const deleteContact = async (id) => {
    const existing = await prisma_1.default.contact.findUnique({ where: { id } });
    if (!existing)
        throw new errorHandler_1.AppError('Contact not found', 404);
    await prisma_1.default.contact.delete({ where: { id } });
};
exports.deleteContact = deleteContact;
// ── CSV BULK UPLOAD ──
const uploadCSV = async (campaignId, fileBuffer) => {
    // Check campaign
    const campaign = await prisma_1.default.campaign.findUnique({
        where: { id: campaignId }
    });
    if (!campaign)
        throw new errorHandler_1.AppError('Campaign not found', 404);
    // Parse CSV
    let records;
    try {
        records = (0, sync_1.parse)(fileBuffer, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
    }
    catch {
        throw new errorHandler_1.AppError('Invalid CSV format', 400);
    }
    if (records.length === 0) {
        throw new errorHandler_1.AppError('CSV file is empty', 400);
    }
    // Get existing phones in this campaign
    const existingContacts = await prisma_1.default.contact.findMany({
        where: { campaignId },
        select: { phone: true }
    });
    const existingPhones = new Set(existingContacts.map(c => c.phone));
    // Get all DNC numbers
    const dncList = await prisma_1.default.dNCList.findMany({ select: { phone: true } });
    const dncSet = new Set(dncList.map(d => d.phone));
    let imported = 0;
    let duplicates = 0;
    let dncSkipped = 0;
    let errors = 0;
    const toInsert = [];
    const seenInBatch = new Set();
    for (const row of records) {
        try {
            // Support flexible column names
            const name = row.name || row.Name || row.NAME || 'Unknown';
            const rawPhone = row.phone || row.Phone || row.PHONE ||
                row.mobile || row.Mobile || row.number || row.Number || '';
            const email = row.email || row.Email || '';
            const company = row.company || row.Company || '';
            const notes = row.notes || row.Notes || '';
            if (!rawPhone) {
                errors++;
                continue;
            }
            const phone = normalizePhone(rawPhone);
            if (!phone) {
                errors++;
                continue;
            }
            // DNC check
            if (dncSet.has(phone)) {
                dncSkipped++;
                continue;
            }
            // Duplicate in DB
            if (existingPhones.has(phone)) {
                duplicates++;
                continue;
            }
            // Duplicate in current batch
            if (seenInBatch.has(phone)) {
                duplicates++;
                continue;
            }
            seenInBatch.add(phone);
            toInsert.push({
                name: name.trim(),
                phone,
                email: email || undefined,
                company: company || undefined,
                notes: notes || undefined,
                campaignId,
                status: 'PENDING',
            });
        }
        catch {
            errors++;
        }
    }
    // Bulk insert in batches of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        await prisma_1.default.contact.createMany({ data: batch, skipDuplicates: true });
        imported += batch.length;
    }
    return {
        imported,
        duplicates,
        dncSkipped,
        errors,
        total: records.length,
    };
};
exports.uploadCSV = uploadCSV;
const addToDNC = async (phone, reason) => {
    const normalized = normalizePhone(phone);
    return await prisma_1.default.dNCList.upsert({
        where: { phone: normalized },
        update: { reason },
        create: { phone: normalized, reason },
    });
};
exports.addToDNC = addToDNC;
const getContactStats = async (campaignId) => {
    const where = campaignId ? { campaignId } : {};
    const [total, pending, calling, answered, noAnswer, busy, done, dnc] = await Promise.all([
        prisma_1.default.contact.count({ where }),
        prisma_1.default.contact.count({ where: { ...where, status: 'PENDING' } }),
        prisma_1.default.contact.count({ where: { ...where, status: 'CALLING' } }),
        prisma_1.default.contact.count({ where: { ...where, status: 'ANSWERED' } }),
        prisma_1.default.contact.count({ where: { ...where, status: 'NO_ANSWER' } }),
        prisma_1.default.contact.count({ where: { ...where, status: 'BUSY' } }),
        prisma_1.default.contact.count({ where: { ...where, status: 'DONE' } }),
        prisma_1.default.contact.count({ where: { ...where, status: 'DNC' } }),
    ]);
    const dialed = total - pending;
    const answerRate = dialed > 0
        ? Math.round(((answered + done) / dialed) * 100) : 0;
    return {
        total, pending, calling, answered,
        noAnswer, busy, done, dnc,
        dialed, answerRate
    };
};
exports.getContactStats = getContactStats;
//# sourceMappingURL=contact.service.js.map