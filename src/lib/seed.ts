import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('Admin@123456', 10)
  await prisma.user.upsert({
    where:  { email: 'admin@ptdt.taxi' },
    update: {},
    create: {
      agentCode: 'AGT-001',
      name:      'Super Admin',
      email:     'admin@ptdt.taxi',
      passwordHash: hash,
      role:      'ADMIN',
      status:    'OFFLINE',
      isActive:  true,
    },
  })
  console.log('✅ Admin ready: admin@ptdt.taxi / Admin@123456')
}

main().finally(() => prisma.$disconnect())
