import prisma from '../lib/prisma'
import { callingBillingService, ensureCallingBillingDefaults } from '../services/callingBilling.service'

const PROVIDER = 'ILLYVOIP'
const DESTINATION_CODE = 'AUDIT_CONCURRENCY'
const DESTINATION_PREFIX = '999001'
const CUSTOMER_RATE = 0.12
const INITIAL_BALANCE = 50
const INITIAL_INCLUDED_SECONDS = 120
const PARALLEL_CALLS = 12

const confirm = String(process.env.AUDIT_BILLING_CONCURRENCY_CONFIRM || '').trim().toLowerCase()

if (confirm !== 'run') {
  console.error('Refusing to run. Set AUDIT_BILLING_CONCURRENCY_CONFIRM=run to execute this DB-writing audit proof.')
  process.exit(1)
}

const runId = `AUDIT_CONCURRENCY_${Date.now()}`
const money = (value: unknown) => Number(value || 0)
const decimal = (value: number) => value.toFixed(4)

async function cleanup() {
  await prisma.commercialCallAuthorization.deleteMany({ where: { account: { code: runId } } })
  await prisma.call.deleteMany({ where: { campaign: { name: runId } } })
  await prisma.contact.deleteMany({ where: { campaign: { name: runId } } })
  await prisma.campaign.deleteMany({ where: { name: runId } })
  await prisma.commercialAccount.deleteMany({ where: { code: runId } })
}

async function main() {
  await ensureCallingBillingDefaults()
  const previousProvider = await prisma.commercialProviderWallet.findUnique({ where: { provider: PROVIDER } })
  const previousRate = await prisma.commercialCallingRate.findUnique({ where: { destinationCode: DESTINATION_CODE } })

  try {
    await cleanup()
    await prisma.commercialProviderWallet.update({
      where: { provider: PROVIDER },
      data: {
        currency: 'EUR',
        availableBalance: '1000.0000',
        reserveBalance: '5.0000',
        enforcementEnabled: true,
      },
    })
    await prisma.commercialCallingRate.upsert({
      where: { destinationCode: DESTINATION_CODE },
      update: {
        destinationName: 'Audit concurrency route',
        dialPrefix: DESTINATION_PREFIX,
        carrierRatePerMinute: decimal(0.06),
        customerRatePerMinute: decimal(CUSTOMER_RATE),
        minimumSeconds: 60,
        incrementSeconds: 60,
        isActive: true,
      },
      create: {
        destinationCode: DESTINATION_CODE,
        destinationName: 'Audit concurrency route',
        dialPrefix: DESTINATION_PREFIX,
        carrierRatePerMinute: decimal(0.06),
        customerRatePerMinute: decimal(CUSTOMER_RATE),
        minimumSeconds: 60,
        incrementSeconds: 60,
        isActive: true,
      },
    })

    const account = await prisma.commercialAccount.create({
      data: {
        name: runId,
        code: runId,
        status: 'ACTIVE',
        currency: 'EUR',
        wallet: {
          create: {
            currency: 'EUR',
            availableBalance: decimal(INITIAL_BALANCE),
            includedSeconds: INITIAL_INCLUDED_SECONDS,
          },
        },
      },
      include: { wallet: true },
    })
    const campaign = await prisma.campaign.create({
      data: {
        name: runId,
        status: 'ACTIVE',
        callerId: '+15550000000',
        commercialAccountId: account.id,
      },
    })
    const contacts = await Promise.all(Array.from({ length: PARALLEL_CALLS }, (_, index) => prisma.contact.create({
      data: {
        name: `Audit Contact ${index + 1}`,
        phone: `${DESTINATION_PREFIX}${String(index + 1).padStart(4, '0')}`,
        campaignId: campaign.id,
      },
    })))
    const calls = await Promise.all(contacts.map(contact => prisma.call.create({
      data: {
        contactId: contact.id,
        campaignId: campaign.id,
        direction: 'outgoing',
        remoteNumber: contact.phone,
        status: 'INITIATED',
      },
    })))

    await Promise.all(calls.map(call => callingBillingService.authorizeCall(call.id)))
    await Promise.all([
      ...calls.slice(0, 6).flatMap(call => [
        callingBillingService.settleCallAuthorization(call.id, 30),
        callingBillingService.settleCallAuthorization(call.id, 30),
      ]),
      ...calls.slice(6, 9).flatMap(call => [
        callingBillingService.releaseCallAuthorization(call.id),
        callingBillingService.releaseCallAuthorization(call.id),
      ]),
    ])
    await prisma.commercialCallAuthorization.updateMany({
      where: { callId: { in: calls.slice(9).map(call => call.id) }, status: 'HELD' },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    })
    const staleCleanup = await callingBillingService.releaseStaleHeldAuthorizations({ olderThanMinutes: 120, limit: 50 })

    const wallet = await prisma.commercialWallet.findUniqueOrThrow({ where: { accountId: account.id } })
    const authorizations = await prisma.commercialCallAuthorization.groupBy({
      by: ['status'],
      _count: { status: true },
      where: { accountId: account.id },
    })
    const transactions = await prisma.commercialWalletTransaction.groupBy({
      by: ['type'],
      _count: { type: true },
      where: { walletId: wallet.id },
    })
    const totalCharged = await prisma.commercialWalletTransaction.aggregate({
      _sum: { amount: true },
      where: { walletId: wallet.id, type: 'CALL_CHARGE' },
    })
    const expectedCharge = 4 * CUSTOMER_RATE

    console.log(JSON.stringify({
      runId,
      accountId: account.id,
      wallet: {
        availableBalance: wallet.availableBalance.toString(),
        heldBalance: wallet.heldBalance.toString(),
        includedSeconds: wallet.includedSeconds,
        heldIncludedSeconds: wallet.heldIncludedSeconds,
      },
      authorizations,
      transactions,
      staleCleanup,
      expected: {
        callChargeTotal: decimal(expectedCharge),
        availableBalance: decimal(INITIAL_BALANCE - expectedCharge),
        heldBalance: decimal(0),
        includedSeconds: 0,
        heldIncludedSeconds: 0,
      },
      actual: {
        callChargeTotal: money(totalCharged._sum.amount).toFixed(4),
      },
      passed:
        money(wallet.availableBalance).toFixed(4) === decimal(INITIAL_BALANCE - expectedCharge) &&
        money(wallet.heldBalance).toFixed(4) === decimal(0) &&
        wallet.includedSeconds === 0 &&
        wallet.heldIncludedSeconds === 0 &&
        money(totalCharged._sum.amount).toFixed(4) === decimal(expectedCharge),
    }, null, 2))
  } finally {
    await cleanup()
    if (previousRate) {
      await prisma.commercialCallingRate.upsert({
        where: { destinationCode: DESTINATION_CODE },
        update: {
          destinationName: previousRate.destinationName,
          dialPrefix: previousRate.dialPrefix,
          carrierRatePerMinute: previousRate.carrierRatePerMinute,
          customerRatePerMinute: previousRate.customerRatePerMinute,
          minimumSeconds: previousRate.minimumSeconds,
          incrementSeconds: previousRate.incrementSeconds,
          isActive: previousRate.isActive,
        },
        create: {
          destinationCode: previousRate.destinationCode,
          destinationName: previousRate.destinationName,
          dialPrefix: previousRate.dialPrefix,
          carrierRatePerMinute: previousRate.carrierRatePerMinute,
          customerRatePerMinute: previousRate.customerRatePerMinute,
          minimumSeconds: previousRate.minimumSeconds,
          incrementSeconds: previousRate.incrementSeconds,
          isActive: previousRate.isActive,
        },
      })
    } else {
      await prisma.commercialCallingRate.deleteMany({ where: { destinationCode: DESTINATION_CODE } })
    }
    if (previousProvider) {
      await prisma.commercialProviderWallet.update({
        where: { provider: PROVIDER },
        data: {
          currency: previousProvider.currency,
          availableBalance: previousProvider.availableBalance,
          reserveBalance: previousProvider.reserveBalance,
          enforcementEnabled: previousProvider.enforcementEnabled,
        },
      })
    }
    await prisma.$disconnect()
  }
}

void main().catch(async error => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
