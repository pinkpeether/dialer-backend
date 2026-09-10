import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

const PROVIDER = 'ILLYVOIP'
const PROVIDER_CURRENCY = 'EUR'

const DEFAULT_RATES = [
  { destinationCode: 'NANP', destinationName: 'USA / Canada', dialPrefix: '1' },
  { destinationCode: 'UK', destinationName: 'United Kingdom', dialPrefix: '44' },
  { destinationCode: 'PK', destinationName: 'Pakistan', dialPrefix: '92' },
] as const

const amount = (value: unknown) => {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) throw new AppError('Invalid calling-billing amount', 400)
  return parsed
}

const money = (value: number) => Number(value.toFixed(4))
const positiveInt = (value: unknown, label: string) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new AppError(`${label} must be a non-negative whole number`, 400)
  return parsed
}

const normalizeDestination = (value: string) => value.replace(/[^0-9]/g, '')
const billableSeconds = (duration: number, minimum: number, increment: number) => Math.ceil(Math.max(duration, minimum) / increment) * increment

export async function ensureCallingBillingDefaults() {
  const provider = await prisma.commercialProviderWallet.upsert({
    where: { provider: PROVIDER },
    update: {},
    create: { provider: PROVIDER, currency: PROVIDER_CURRENCY, reserveBalance: '5.0000', enforcementEnabled: false },
  })

  await Promise.all(DEFAULT_RATES.map(rate => prisma.commercialCallingRate.upsert({
    where: { destinationCode: rate.destinationCode },
    update: {},
    create: { ...rate, carrierRatePerMinute: '0.000000', customerRatePerMinute: '0.000000', minimumSeconds: 60, incrementSeconds: 60, isActive: false },
  })))

  return provider
}

async function providerCapacity() {
  const provider = await ensureCallingBillingDefaults()
  const aggregate = await prisma.commercialWallet.aggregate({
    _sum: { availableBalance: true, heldBalance: true },
    where: { currency: PROVIDER_CURRENCY },
  })
  const outstanding = amount(aggregate._sum.availableBalance) + amount(aggregate._sum.heldBalance)
  const allocatable = Math.max(0, amount(provider.availableBalance) - amount(provider.reserveBalance) - outstanding)
  return { provider, outstanding: money(outstanding), allocatable: money(allocatable) }
}

export const callingBillingService = {
  async getPlatformSetup() {
    const { provider, outstanding, allocatable } = await providerCapacity()
    const rates = await prisma.commercialCallingRate.findMany({ orderBy: { destinationCode: 'asc' } })
    return { provider, outstandingCustomerCredit: outstanding, allocatableCustomerCredit: allocatable, rates }
  },

  async updateProviderWallet(input: { availableBalance?: unknown; reserveBalance?: unknown; enforcementEnabled?: unknown }) {
    await ensureCallingBillingDefaults()
    const data: Record<string, unknown> = {}
    if (input.availableBalance !== undefined) {
      const value = amount(input.availableBalance)
      if (value < 0) throw new AppError('Provider balance cannot be negative', 400)
      data.availableBalance = money(value).toFixed(4)
    }
    if (input.reserveBalance !== undefined) {
      const value = amount(input.reserveBalance)
      if (value < 0) throw new AppError('Provider reserve cannot be negative', 400)
      data.reserveBalance = money(value).toFixed(4)
    }
    if (input.enforcementEnabled !== undefined) data.enforcementEnabled = Boolean(input.enforcementEnabled)
    return prisma.commercialProviderWallet.update({ where: { provider: PROVIDER }, data })
  },

  async saveRate(input: { destinationCode: string; destinationName: string; dialPrefix: string; carrierRatePerMinute: unknown; customerRatePerMinute: unknown; minimumSeconds: unknown; incrementSeconds: unknown; isActive: unknown }) {
    const destinationCode = String(input.destinationCode || '').trim().toUpperCase()
    const destinationName = String(input.destinationName || '').trim()
    const dialPrefix = normalizeDestination(String(input.dialPrefix || ''))
    const carrierRatePerMinute = amount(input.carrierRatePerMinute)
    const customerRatePerMinute = amount(input.customerRatePerMinute)
    const minimumSeconds = positiveInt(input.minimumSeconds, 'Minimum seconds')
    const incrementSeconds = positiveInt(input.incrementSeconds, 'Billing increment seconds')

    if (!destinationCode || !destinationName || !dialPrefix) throw new AppError('Destination code, name, and dial prefix are required', 400)
    if (carrierRatePerMinute < 0 || customerRatePerMinute < 0 || minimumSeconds < 1 || incrementSeconds < 1) throw new AppError('Calling rates and billing intervals must be positive', 400)
    if (Boolean(input.isActive) && customerRatePerMinute <= 0) throw new AppError('An active calling rate requires a customer rate greater than zero', 400)

    return prisma.commercialCallingRate.upsert({
      where: { destinationCode },
      update: { destinationName, dialPrefix, carrierRatePerMinute: carrierRatePerMinute.toFixed(6), customerRatePerMinute: customerRatePerMinute.toFixed(6), minimumSeconds, incrementSeconds, isActive: Boolean(input.isActive) },
      create: { destinationCode, destinationName, dialPrefix, carrierRatePerMinute: carrierRatePerMinute.toFixed(6), customerRatePerMinute: customerRatePerMinute.toFixed(6), minimumSeconds, incrementSeconds, isActive: Boolean(input.isActive) },
    })
  },

  async grantAllowance(accountId: number, input: { credit?: unknown; includedMinutes?: unknown; reference?: string; description?: string }) {
    const credit = amount(input.credit)
    const includedMinutes = positiveInt(input.includedMinutes || 0, 'Included minutes')
    if (credit < 0) throw new AppError('Calling credit cannot be negative', 400)
    if (credit === 0 && includedMinutes === 0) throw new AppError('Enter calling credit or included minutes', 400)

    const { provider, allocatable } = await providerCapacity()
    if (credit > allocatable) throw new AppError(`Only EUR ${allocatable.toFixed(4)} can be allocated while preserving the EUR ${amount(provider.reserveBalance).toFixed(2)} IllyVoIP reserve.`, 409)

    const account = await prisma.commercialAccount.findUnique({ where: { id: accountId }, include: { wallet: true } })
    if (!account?.wallet) throw new AppError('Commercial wallet not found', 404)
    if (account.wallet.currency !== PROVIDER_CURRENCY) throw new AppError('IllyVoIP calling credit requires this commercial account wallet to use EUR.', 409)

    return prisma.$transaction(async tx => {
      const nextBalance = money(amount(account.wallet!.availableBalance) + credit)
      const nextIncludedSeconds = account.wallet!.includedSeconds + includedMinutes * 60
      const wallet = await tx.commercialWallet.update({
        where: { id: account.wallet!.id },
        data: { availableBalance: nextBalance.toFixed(4), includedSeconds: nextIncludedSeconds },
      })
      const transaction = await tx.commercialWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'BONUS_CREDIT',
          direction: 'CREDIT',
          amount: credit.toFixed(4),
          balanceAfter: nextBalance.toFixed(4),
          referenceType: 'ILLYVOIP_ALLOCATION',
          referenceId: input.reference || null,
          description: input.description || 'PTDT calling credit allocation from shared IllyVoIP capacity',
          metadata: { includedMinutes, provider: PROVIDER, providerReserve: amount(provider.reserveBalance) },
        },
      })
      return { wallet, transaction }
    })
  },

  async authorizeCall(callId: number) {
    const existing = await prisma.commercialCallAuthorization.findUnique({ where: { callId } })
    if (existing) return existing

    const provider = await prisma.commercialProviderWallet.findUnique({ where: { provider: PROVIDER } })
    if (!provider?.enforcementEnabled) return null

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: { campaign: { include: { commercialAccount: { include: { wallet: true } } } } },
    })
    if (!call) throw new AppError('Call not found for calling authorization', 404)
    const account = call.campaign.commercialAccount
    if (!account?.wallet) return null

    if (account.status !== 'ACTIVE') throw new AppError('Commercial account is not active for outbound calling.', 403)
    if (account.wallet.currency !== PROVIDER_CURRENCY) throw new AppError('Outbound calling requires an EUR commercial wallet while IllyVoIP is the carrier.', 409)
    if (amount(provider.availableBalance) <= amount(provider.reserveBalance)) throw new AppError('IllyVoIP provider reserve reached. Outbound calling is paused until the provider wallet is topped up.', 402)

    const destination = normalizeDestination(call.remoteNumber || '')
    const rates = await prisma.commercialCallingRate.findMany({ where: { isActive: true }, orderBy: { dialPrefix: 'desc' } })
    const rate = rates.sort((a, b) => b.dialPrefix.length - a.dialPrefix.length).find(item => destination.startsWith(item.dialPrefix))
    if (!rate) throw new AppError('No active EUR calling rate matches this destination. Configure the rate card before placing this call.', 422)

    const minimumSeconds = billableSeconds(rate.minimumSeconds, rate.minimumSeconds, rate.incrementSeconds)
    const heldIncludedSeconds = Math.min(account.wallet.includedSeconds, minimumSeconds)
    const heldAmount = money((minimumSeconds - heldIncludedSeconds) / 60 * amount(rate.customerRatePerMinute))
    if (amount(account.wallet.availableBalance) + amount(account.wallet.creditLimit) < heldAmount) throw new AppError('Calling wallet has insufficient credit for this destination.', 402)

    return prisma.$transaction(async tx => {
      const wallet = await tx.commercialWallet.update({
        where: { id: account.wallet!.id },
        data: {
          availableBalance: money(amount(account.wallet!.availableBalance) - heldAmount).toFixed(4),
          heldBalance: money(amount(account.wallet!.heldBalance) + heldAmount).toFixed(4),
          includedSeconds: account.wallet!.includedSeconds - heldIncludedSeconds,
          heldIncludedSeconds: account.wallet!.heldIncludedSeconds + heldIncludedSeconds,
        },
      })
      const authorization = await tx.commercialCallAuthorization.create({
        data: { accountId: account.id, walletId: wallet.id, callId, rateId: rate.id, destination: call.remoteNumber || destination, heldAmount: heldAmount.toFixed(4), heldIncludedSeconds },
      })
      await tx.commercialWalletTransaction.create({
        data: { walletId: wallet.id, type: 'HOLD', direction: 'HOLD', amount: heldAmount.toFixed(4), balanceAfter: wallet.availableBalance, referenceType: 'CALL_AUTHORIZATION', referenceId: authorization.id, description: 'Outbound calling authorization hold', metadata: { callId, heldIncludedSeconds, minimumSeconds } },
      })
      return authorization
    })
  },

  async releaseCallAuthorization(callId: number) {
    const authorization = await prisma.commercialCallAuthorization.findUnique({ where: { callId } })
    if (!authorization || authorization.status !== 'HELD') return authorization
    return prisma.$transaction(async tx => {
      const wallet = await tx.commercialWallet.findUniqueOrThrow({ where: { id: authorization.walletId } })
      const updated = await tx.commercialWallet.update({
        where: { id: wallet.id },
        data: { availableBalance: money(amount(wallet.availableBalance) + amount(authorization.heldAmount)).toFixed(4), heldBalance: money(Math.max(0, amount(wallet.heldBalance) - amount(authorization.heldAmount))).toFixed(4), includedSeconds: wallet.includedSeconds + authorization.heldIncludedSeconds, heldIncludedSeconds: Math.max(0, wallet.heldIncludedSeconds - authorization.heldIncludedSeconds) },
      })
      await tx.commercialWalletTransaction.create({ data: { walletId: wallet.id, type: 'RELEASE', direction: 'RELEASE', amount: authorization.heldAmount, balanceAfter: updated.availableBalance, referenceType: 'CALL_AUTHORIZATION', referenceId: authorization.id, description: 'Outbound calling authorization released' } })
      return tx.commercialCallAuthorization.update({ where: { id: authorization.id }, data: { status: 'RELEASED', releasedAt: new Date() } })
    })
  },

  async settleCallAuthorization(callId: number, durationSeconds: number) {
    const authorization = await prisma.commercialCallAuthorization.findUnique({ where: { callId }, include: { rate: true } })
    if (!authorization || authorization.status !== 'HELD') return authorization
    if (durationSeconds <= 0) return this.releaseCallAuthorization(callId)

    return prisma.$transaction(async tx => {
      const wallet = await tx.commercialWallet.findUniqueOrThrow({ where: { id: authorization.walletId } })
      const billedSeconds = billableSeconds(durationSeconds, authorization.rate.minimumSeconds, authorization.rate.incrementSeconds)
      const additionalIncludedSeconds = Math.min(wallet.includedSeconds, Math.max(0, billedSeconds - authorization.heldIncludedSeconds))
      const includedSeconds = authorization.heldIncludedSeconds + additionalIncludedSeconds
      const charge = money((billedSeconds - includedSeconds) / 60 * amount(authorization.rate.customerRatePerMinute))
      const extraCharge = money(charge - amount(authorization.heldAmount))
      const nextAvailable = money(amount(wallet.availableBalance) - extraCharge)
      const updated = await tx.commercialWallet.update({
        where: { id: wallet.id },
        data: { availableBalance: nextAvailable.toFixed(4), heldBalance: money(Math.max(0, amount(wallet.heldBalance) - amount(authorization.heldAmount))).toFixed(4), includedSeconds: wallet.includedSeconds - additionalIncludedSeconds, heldIncludedSeconds: Math.max(0, wallet.heldIncludedSeconds - authorization.heldIncludedSeconds) },
      })
      await tx.commercialWalletTransaction.create({
        data: { walletId: wallet.id, type: 'CALL_CHARGE', direction: 'DEBIT', amount: charge.toFixed(4), balanceAfter: updated.availableBalance, referenceType: 'CALL', referenceId: String(callId), description: `Outbound call charge: ${billedSeconds} billable seconds`, metadata: { authorizationId: authorization.id, billedSeconds, includedSeconds, ratePerMinute: authorization.rate.customerRatePerMinute.toString() } },
      })
      return tx.commercialCallAuthorization.update({ where: { id: authorization.id }, data: { status: 'SETTLED', settledAt: new Date() } })
    })
  },
}
