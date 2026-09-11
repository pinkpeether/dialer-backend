import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'

const PROVIDER = 'ILLYVOIP'
const PROVIDER_CURRENCY = 'EUR'
const DEFAULT_PROVIDER_PROFILE = {
  provider: PROVIDER,
  displayName: 'illyVoIP',
  providerType: 'SIP_TRUNK',
  status: 'ACTIVE',
  balanceMode: 'MANUAL',
  trunkName: 'illyvoip-out',
  apiName: 'SMS API only',
  notes: 'Calling API docs are currently unavailable; provider balance is maintained manually until a provider adapter is available.',
} as const

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
const normalizeProviderCode = (value: unknown) => String(value || PROVIDER)
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40) || PROVIDER
const optionalText = (value: unknown) => {
  if (value === undefined) return undefined
  const text = String(value || '').trim()
  return text || null
}
const positiveInt = (value: unknown, label: string) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new AppError(`${label} must be a non-negative whole number`, 400)
  return parsed
}

const normalizeDestination = (value: string) => value.replace(/[^0-9]/g, '')
const billableSeconds = (duration: number, minimum: number, increment: number) => Math.ceil(Math.max(duration, minimum) / increment) * increment
type BillingTx = Prisma.TransactionClient

const isSerializableConflict = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2034')

const serializableBillingTransaction = async <T>(fn: (tx: BillingTx) => Promise<T>, attempts = 3): Promise<T> => {
  try {
    return await prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    })
  } catch (error) {
    if (attempts > 1 && isSerializableConflict(error)) {
      return serializableBillingTransaction(fn, attempts - 1)
    }
    throw error
  }
}

export async function ensureCallingBillingDefaults() {
  const provider = await prisma.commercialProviderWallet.upsert({
    where: { provider: PROVIDER },
    update: {},
    create: { ...DEFAULT_PROVIDER_PROFILE, currency: PROVIDER_CURRENCY, reserveBalance: '5.0000', enforcementEnabled: false },
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

async function providerCapacityTx(tx: BillingTx) {
  const provider = await tx.commercialProviderWallet.findUnique({ where: { provider: PROVIDER } })
  if (!provider) throw new AppError('Calling provider wallet is not configured', 500)

  const aggregate = await tx.commercialWallet.aggregate({
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
    const providers = await prisma.commercialProviderWallet.findMany({ orderBy: [{ status: 'asc' }, { provider: 'asc' }] })
    const rates = await prisma.commercialCallingRate.findMany({ orderBy: { destinationCode: 'asc' } })
    return { provider, providers, outstandingCustomerCredit: outstanding, allocatableCustomerCredit: allocatable, rates }
  },

  async updateProviderWallet(input: {
    provider?: unknown
    displayName?: unknown
    providerType?: unknown
    status?: unknown
    balanceMode?: unknown
    trunkName?: unknown
    apiBaseUrl?: unknown
    apiUsername?: unknown
    apiName?: unknown
    apiKeyLabel?: unknown
    apiSecretLabel?: unknown
    passwordLabel?: unknown
    docsUrl?: unknown
    notes?: unknown
    currency?: unknown
    availableBalance?: unknown
    reserveBalance?: unknown
    enforcementEnabled?: unknown
  }) {
    await ensureCallingBillingDefaults()
    const provider = normalizeProviderCode(input.provider)
    const currency = String(input.currency || PROVIDER_CURRENCY).trim().toUpperCase().slice(0, 3) || PROVIDER_CURRENCY
    const data: Record<string, unknown> = {}
    ;(['displayName', 'providerType', 'status', 'balanceMode', 'trunkName', 'apiBaseUrl', 'apiUsername', 'apiName', 'apiKeyLabel', 'apiSecretLabel', 'passwordLabel', 'docsUrl', 'notes'] as const).forEach(key => {
      if (input[key] !== undefined) data[key] = optionalText(input[key])
    })
    if (input.currency !== undefined) data.currency = currency
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
    return prisma.commercialProviderWallet.upsert({
      where: { provider },
      update: data,
      create: {
        provider,
        displayName: optionalText(input.displayName) || provider,
        providerType: optionalText(input.providerType) || 'SIP_TRUNK',
        status: optionalText(input.status) || 'INACTIVE',
        balanceMode: optionalText(input.balanceMode) || 'MANUAL',
        trunkName: optionalText(input.trunkName),
        apiBaseUrl: optionalText(input.apiBaseUrl),
        apiUsername: optionalText(input.apiUsername),
        apiName: optionalText(input.apiName),
        apiKeyLabel: optionalText(input.apiKeyLabel),
        apiSecretLabel: optionalText(input.apiSecretLabel),
        passwordLabel: optionalText(input.passwordLabel),
        docsUrl: optionalText(input.docsUrl),
        notes: optionalText(input.notes),
        currency,
        availableBalance: input.availableBalance !== undefined ? data.availableBalance as string : '0.0000',
        reserveBalance: input.reserveBalance !== undefined ? data.reserveBalance as string : '5.0000',
        enforcementEnabled: Boolean(input.enforcementEnabled),
      },
    })
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

    await ensureCallingBillingDefaults()
    return serializableBillingTransaction(async tx => {
      const { provider, allocatable } = await providerCapacityTx(tx)
      if (credit > allocatable) throw new AppError(`Only EUR ${allocatable.toFixed(4)} can be allocated while preserving the EUR ${amount(provider.reserveBalance).toFixed(2)} IllyVoIP reserve.`, 409)

      const account = await tx.commercialAccount.findUnique({ where: { id: accountId }, include: { wallet: true } })
      if (!account?.wallet) throw new AppError('Commercial wallet not found', 404)
      if (account.wallet.currency !== PROVIDER_CURRENCY) throw new AppError('Calling credit currently requires this commercial account wallet to use EUR.', 409)

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
          referenceType: 'PROVIDER_ALLOCATION',
          referenceId: input.reference || null,
          description: input.description || 'PTDT calling credit allocation from shared provider capacity',
          metadata: { includedMinutes, provider: PROVIDER, providerReserve: amount(provider.reserveBalance) },
        },
      })
      return { wallet, transaction }
    })
  },

  async authorizeCall(callId: number) {
    const provider = await prisma.commercialProviderWallet.findUnique({ where: { provider: PROVIDER } })
    if (!provider?.enforcementEnabled) return null

    return serializableBillingTransaction(async tx => {
      const existing = await tx.commercialCallAuthorization.findUnique({ where: { callId } })
      if (existing) return existing

      const currentProvider = await tx.commercialProviderWallet.findUnique({ where: { provider: PROVIDER } })
      if (!currentProvider?.enforcementEnabled) return null

      const call = await tx.call.findUnique({
        where: { id: callId },
        include: { campaign: { include: { commercialAccount: { include: { wallet: true } } } } },
      })
      if (!call) throw new AppError('Call not found for calling authorization', 404)
      const account = call.campaign.commercialAccount
      if (!account?.wallet) return null

      if (account.status !== 'ACTIVE') throw new AppError('Commercial account is not active for outbound calling.', 403)
      if (account.wallet.currency !== PROVIDER_CURRENCY) throw new AppError('Outbound calling requires an EUR commercial wallet while the active provider wallet is EUR.', 409)
      if (amount(currentProvider.availableBalance) <= amount(currentProvider.reserveBalance)) throw new AppError('Provider reserve reached. Outbound calling is paused until the provider wallet is topped up.', 402)

      const destination = normalizeDestination(call.remoteNumber || '')
      const rates = await tx.commercialCallingRate.findMany({ where: { isActive: true }, orderBy: { dialPrefix: 'desc' } })
      const rate = rates.sort((a, b) => b.dialPrefix.length - a.dialPrefix.length).find(item => destination.startsWith(item.dialPrefix))
      if (!rate) throw new AppError('No active EUR calling rate matches this destination. Configure the rate card before placing this call.', 422)

      const minimumSeconds = billableSeconds(rate.minimumSeconds, rate.minimumSeconds, rate.incrementSeconds)
      const heldIncludedSeconds = Math.min(account.wallet.includedSeconds, minimumSeconds)
      const heldAmount = money((minimumSeconds - heldIncludedSeconds) / 60 * amount(rate.customerRatePerMinute))
      if (amount(account.wallet.availableBalance) + amount(account.wallet.creditLimit) < heldAmount) throw new AppError('Calling wallet has insufficient credit for this destination.', 402)

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
    return serializableBillingTransaction(async tx => {
      const authorization = await tx.commercialCallAuthorization.findUnique({ where: { callId } })
      if (!authorization || authorization.status !== 'HELD') return authorization
      const statusUpdate = await tx.commercialCallAuthorization.updateMany({
        where: { id: authorization.id, status: 'HELD' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      })
      if (statusUpdate.count !== 1) {
        return tx.commercialCallAuthorization.findUnique({ where: { id: authorization.id } })
      }
      const wallet = await tx.commercialWallet.findUniqueOrThrow({ where: { id: authorization.walletId } })
      const updated = await tx.commercialWallet.update({
        where: { id: wallet.id },
        data: { availableBalance: money(amount(wallet.availableBalance) + amount(authorization.heldAmount)).toFixed(4), heldBalance: money(Math.max(0, amount(wallet.heldBalance) - amount(authorization.heldAmount))).toFixed(4), includedSeconds: wallet.includedSeconds + authorization.heldIncludedSeconds, heldIncludedSeconds: Math.max(0, wallet.heldIncludedSeconds - authorization.heldIncludedSeconds) },
      })
      await tx.commercialWalletTransaction.create({ data: { walletId: wallet.id, type: 'RELEASE', direction: 'RELEASE', amount: authorization.heldAmount, balanceAfter: updated.availableBalance, referenceType: 'CALL_AUTHORIZATION', referenceId: authorization.id, description: 'Outbound calling authorization released' } })
      return tx.commercialCallAuthorization.findUnique({ where: { id: authorization.id } })
    })
  },

  async settleCallAuthorization(callId: number, durationSeconds: number) {
    if (durationSeconds <= 0) return this.releaseCallAuthorization(callId)

    return serializableBillingTransaction(async tx => {
      const authorization = await tx.commercialCallAuthorization.findUnique({ where: { callId }, include: { rate: true } })
      if (!authorization || authorization.status !== 'HELD') return authorization
      const statusUpdate = await tx.commercialCallAuthorization.updateMany({
        where: { id: authorization.id, status: 'HELD' },
        data: { status: 'SETTLED', settledAt: new Date() },
      })
      if (statusUpdate.count !== 1) {
        return tx.commercialCallAuthorization.findUnique({ where: { id: authorization.id }, include: { rate: true } })
      }
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
      return tx.commercialCallAuthorization.findUnique({ where: { id: authorization.id }, include: { rate: true } })
    })
  },
}
