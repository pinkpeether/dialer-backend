"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const hash = await bcryptjs_1.default.hash('Admin@123456', 10);
    await prisma.user.upsert({
        where: { email: 'admin@ptdt.taxi' },
        update: {},
        create: {
            agentCode: 'AGT-001',
            name: 'Super Admin',
            email: 'admin@ptdt.taxi',
            passwordHash: hash,
            role: 'ADMIN',
            status: 'OFFLINE',
            isActive: true,
        },
    });
    console.log('✅ Admin ready: admin@ptdt.taxi / Admin@123456');
}
main().finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map