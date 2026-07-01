import prisma from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { logAuditEvent } from './audit.service'

type Actor = {
  id: number
  email?: string
  role?: string
}

type CommercialPlanCode = 'BASIC' | 'STANDARD' | 'PREMIUM' | 'ELITE' | 'ENTERPRISE'
type CommercialAddonCode =
  | 'DYNAMIC_CALLER_ID'
  | 'SMS'
  | 'AI_TRANSCRIPTS'
  | 'AI_INSIGHTS'
  | 'RECORDINGS'
  | 'ADVANCED_ANALYTICS'
  | 'CRM_CONNECTORS'

type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'TRIAL'
type AddonStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_APPROVAL'
type PaymentStatus = 'PENDING_PAYMENT' | 'PAYMENT_SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export type CreateCommercialAccountInput = {
  name: string
  code?: string
  email?: string | null
  phone?: string | null
  currency?: string
  lowBalanceThreshold?: number | string
  criticalBalanceThreshold?: number | string
}

export type CreatePaymentRequestInput = {
  accountId: number
  amount: number | string
  currency?: string
  requestedPlanCode?: CommercialPlanCode | null
  requestedAddonCodes?: CommercialAddonCode[]
  paymentMethod?: string | null
  paymentReference?: string | null
  proofUrl?: string | null
  notes?: string | null
}

export type TopUpWalletInput = {
  amount: number | string
  description?: string | null
  reference?: string | null
}

export type ActivatePlanInput = {
  planCode: CommercialPlanCode
  status?: SubscriptionStatus
  monthlyFeeOverride?: number | string | null
  endsAt?: string | null
  notes?: string | null
}

export type SetAddonInput = {
  status: AddonStatus
  priceOverride?: number | string | null
  notes?: string | null
}

export type ThresholdInput = {
  lowBalanceThreshold?: number | string
  criticalBalanceThreshold?: number | string
  hardStopEnabled?: boolean
}

const DEFAULT_ACCOUNT_CODE = 'PTDT_DEFAULT'

const PLAN_CATALOG = [
  {
    code: 'BASIC',
    name: 'Basic',
    monthlyFee: '49',
    includedSeats: 3,
    description: 'Core dialer access for small outbound teams.',
    features: {
      dialer: true,
      contacts: true,
      campaigns: false,
      recordings: false,
      aiTranscripts: false,
      dynamicCallerId: false,
    },
  },
  {
    code: 'STANDARD',
    name: 'Standard',
    monthlyFee: '149',
    includedSeats: 10,
    description: 'Campaigns, recordings, reports, and low-balance alerts.',
    features: {
      dialer: true,
      contacts: true,
      campaigns: true,
      recordings: true,
      aiTranscripts: false,
      dynamicCallerId: false,
    },
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    monthlyFee: '349',
    includedSeats: 25,
    description: 'AI transcripts, SMS, advanced reporting, and commercial controls.',
    features: {
      dialer: true,
      contacts: true,
      campaigns: true,
      recordings: true,
      aiTranscripts: true,
      sms: true,
      dynamicCallerId: 'addon',
    },
  },
  {
    code: 'ELITE',
    name: 'Elite',
    monthlyFee: '899',
    includedSeats: 75,
    description: 'Larger teams with advanced analytics, governance, and priority support.',
    features: {
      dialer: true,
      contacts: true,
      campaigns: true,
      recordings: true,
      aiTranscripts: true,
      aiInsights: true,
      sms: true,
      dynamicCallerId: 'addon',
      advancedAnalytics: true,
    },
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    monthlyFee: '0',
    includedSeats: 0,
    description: 'Custom enterprise contract, custom routing, SLA, and integrations.',
    features: {
      customContract: true,
      dedicatedSupport: true,
      customRateCards: true,
      crmConnectors: true,
      dynamicCallerId: 'addon',
    },
  },
] as const

const ADDON_CATALOG = [
  {
    code: 'DYNAMIC_CALLER_ID',
    name: 'Dynamic Caller ID',
    monthlyFee: '99',
    description: 'Verified caller ID pool, per-call selection, and admin activation control.',
  },
  {
    code: 'SMS',
    name: 'SMS Messaging',
    monthlyFee: '49',
    description: 'Outbound SMS console and usage-based SMS billing controls.',
  },
  {
    code: 'AI_TRANSCRIPTS',
    name: 'AI Transcripts',
    monthlyFee: '79',
    description: 'AI transcription entitlement for recorded calls.',
  },
  {
    code: 'AI_INSIGHTS',
    name: 'AI Insights',
    monthlyFee: '99',
    description: 'AI call summaries, sentiment, intent, objections, and action items.',
  },
  {
    code: 'RECORDINGS',
    name: 'Recording Storage',
    monthlyFee: '39',
    description: 'Recording library, retention controls, playback, and exports.',
  },
  {
    code: 'ADVANCED_ANALYTICS',
    name: 'Advanced Analytics',
    monthlyFee: '129',
    description: 'Advanced reports, usage insights, and supervisor analytics.',
  },
  {
    code: 'CRM_CONNECTORS',
    name: 'CRM Connectors',
    monthlyFee: '199',
    description: 'Enterprise connector readiness for Salesforce, HubSpot, Zoho, Zendesk, and Pipedrive.',
  },
] as const

const normalizeCurrency = (currency?: string | null) => (currency || 'USD').trim().toUpperCase().slice(0, 3)

const toDecimalString = (value: number | string | null | undefined, fallback = '0') => {
  if (value === null || value === undefined || value === '') return fallback
  const amount = Number(value)
  if (!Number.isFinite(amount)) throw new AppError('Invalid amount', 400)
  return amount.toFixed(4)
}

const toMoney = (value: unknown) => Number(value || 0)

const slugifyCode = (value: string) => value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40)

const parseId = (value: number | string) => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid id', 400)
  return id
}

const audit = async (
  actor: Actor | undefined,
  action: string,
  entity: string,
  entityId: number | string | null,
  metadata?: Record<string, unknown>,
) => {
  await logAuditEvent({
    actor,
    action,
    entity,
    entityId: entityId === null ? undefined : String(entityId),
    metadata,
  })
}

async function seedCatalog() {
  for (const plan of PLAN_CATALOG) {
    await prisma.commercialPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        monthlyFee: plan.monthlyFee,
        includedSeats: plan.includedSeats,
        description: plan.description,
        features: plan.features,
        isActive: true,
      },
      create: {
        code: plan.code,
        name: plan.name,
        monthlyFee: plan.monthlyFee,
        includedSeats: plan.includedSeats,
        description: plan.description,
        features: plan.features,
        isActive: true,
      },
    })
  }

  for (const addon of ADDON_CATALOG) {
    await prisma.commercialAddon.upsert({
      where: { code: addon.code },
      update: {
        name: addon.name,
        monthlyFee: addon.monthlyFee,
        description: addon.description,
        isActive: true,
      },
      create: {
        code: addon.code,
        name: addon.name,
        monthlyFee: addon.monthlyFee,
        description: addon.description,
        isActive: true,
      },
    })
  }
}

async function ensureDefaultAccount() {
  await seedCatalog()

  const account = await prisma.commercialAccount.upsert({
    where: { code: DEFAULT_ACCOUNT_CODE },
    update: {},
    create: {
      name: 'PTDT Default Commercial Account',
      code: DEFAULT_ACCOUNT_CODE,
      status: 'ACTIVE',
      currency: 'USD',
      lowBalanceThreshold: '10.0000',
      criticalBalanceThreshold: '3.0000',
      hardStopEnabled: true,
    },
  })

  await prisma.commercialWallet.upsert({
    where: { accountId: account.id },
    update: {},
    create: {
      accountId: account.id,
      currency: account.currency,
      availableBalance: '0.0000',
      heldBalance: '0.0000',
      creditLimit: '0.0000',
    },
  })

  return account
}

async function evaluateBalanceAlert(accountId: number) {
  const account = await prisma.commercialAccount.findUnique({
    where: { id: accountId },
    include: { wallet: true },
  })
  if (!account || !account.wallet) return null

  const balance = toMoney(account.wallet.availableBalance)
  const low = toMoney(account.lowBalanceThreshold)
  const critical = toMoney(account.criticalBalanceThreshold)

  let severity: 'LOW_BALANCE' | 'CRITICAL_BALANCE' | 'HARD_STOP' | null = null
  let title = ''
  let body = ''
  let threshold = '0.0000'

  if (account.hardStopEnabled && balance <= 0) {
    severity = 'HARD_STOP'
    title = 'Calling balance depleted'
    body = 'Outbound paid calling should be blocked until the wallet is topped up.'
    threshold = '0.0000'
  } else if (balance <= critical) {
    severity = 'CRITICAL_BALANCE'
    title = 'Critical calling balance'
    body = `Calling balance is at or below ${critical.toFixed(2)} ${account.currency}.`
    threshold = account.criticalBalanceThreshold.toString()
  } else if (balance <= low) {
    severity = 'LOW_BALANCE'
    title = 'Low calling balance'
    body = `Calling balance is at or below ${low.toFixed(2)} ${account.currency}.`
    threshold = account.lowBalanceThreshold.toString()
  }

  if (!severity) return null

  const recentSame = await prisma.commercialBillingAlert.findFirst({
    where: {
      accountId,
      severity,
      isRead: false,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (recentSame) return recentSame

  const alert = await prisma.commercialBillingAlert.create({
    data: {
      accountId,
      severity,
      title,
      body,
      balanceAt: account.wallet.availableBalance,
      thresholdValue: threshold,
    },
  })

  await prisma.notification.create({
    data: {
      userId: null,
      type: severity,
      title,
      body,
      metadata: {
        commercialAccountId: accountId,
        balance,
        currency: account.currency,
      },
    },
  }).catch(() => null)

  return alert
}

async function getAccountOrDefault(accountId?: number | string | null) {
  if (!accountId) {
    const account = await prisma.commercialAccount.findFirst({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'asc' },
    })
    if (!account) throw new AppError('No commercial account found. Create a commercial account first.', 404)
    return account
  }

  const id = parseId(accountId)
  const account = await prisma.commercialAccount.findUnique({ where: { id } })
  if (!account) throw new AppError('Commercial account not found', 404)
  return account
}

function buildBalanceState(account: any, wallet: any) {
  const balance = toMoney(wallet?.availableBalance)
  const low = toMoney(account.lowBalanceThreshold)
  const critical = toMoney(account.criticalBalanceThreshold)

  if (account.hardStopEnabled && balance <= 0) return 'HARD_STOP'
  if (balance <= critical) return 'CRITICAL_BALANCE'
  if (balance <= low) return 'LOW_BALANCE'
  return 'HEALTHY'
}

export const commercialControlService = {
  async seedCatalog(actor?: Actor) {
    await seedCatalog()
    await audit(actor, 'COMMERCIAL_CATALOG_SEEDED', 'CommercialControl', null, { defaultAccountCreated: false })
    return this.getCatalog()
  },

  async getCatalog() {
    await seedCatalog()
    const [plans, addons] = await Promise.all([
      prisma.commercialPlan.findMany({ where: { isActive: true }, orderBy: [{ monthlyFee: 'asc' }, { id: 'asc' }] }),
      prisma.commercialAddon.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } }),
    ])
    return { plans, addons }
  },

  async getSummary(accountId?: number | string | null) {
    const account = await getAccountOrDefault(accountId)

    const [wallet, subscription, accountAddons, alerts, callerIds] = await Promise.all([
      prisma.commercialWallet.findUnique({ where: { accountId: account.id } }),
      prisma.commercialSubscription.findFirst({
        where: { accountId: account.id, status: { in: ['ACTIVE', 'TRIAL'] as any } },
        include: { plan: true },
        orderBy: { startsAt: 'desc' },
      }),
      prisma.commercialAccountAddon.findMany({
        where: { accountId: account.id },
        include: { addon: true },
        orderBy: { id: 'asc' },
      }),
      prisma.commercialBillingAlert.findMany({
        where: { accountId: account.id, isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.spoofingNumber.findMany({
        where: { isVerified: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }).catch(() => []),
    ])

    const latestTransactions = wallet
      ? await prisma.commercialWalletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      : []

    const catalog = await this.getCatalog()
    const addonStatuses = catalog.addons.map(addon => {
      const accountAddon = accountAddons.find(item => item.addonId === addon.id)
      return {
        addon,
        status: accountAddon?.status || 'INACTIVE',
        startsAt: accountAddon?.startsAt || null,
        endsAt: accountAddon?.endsAt || null,
        priceOverride: accountAddon?.priceOverride || null,
        notes: accountAddon?.notes || null,
      }
    })

    return {
      account,
      wallet,
      balanceState: buildBalanceState(account, wallet),
      subscription,
      addons: addonStatuses,
      alerts,
      latestTransactions,
      callerIdControl: {
        dynamicCallerIdEnabled: addonStatuses.some(item => item.addon.code === 'DYNAMIC_CALLER_ID' && item.status === 'ACTIVE'),
        verifiedCallerIds: callerIds.length,
        activeVerifiedCallerIds: callerIds.filter(item => item.isActive).length,
        availableNumbers: callerIds.filter(item => item.isActive).map(item => ({
          id: item.id,
          displayNumber: item.displayNumber,
          displayName: item.displayName,
          scope: item.scope,
          provider: item.provider,
        })),
      },
    }
  },

  async listAccounts(options: { includeArchived?: boolean } = {}) {
    return prisma.commercialAccount.findMany({
      where: options.includeArchived ? undefined : { status: { not: 'ARCHIVED' } },
      include: {
        wallet: true,
        subscriptions: { include: { plan: true }, orderBy: { startsAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  async createAccount(input: CreateCommercialAccountInput, actor?: Actor) {
    if (!input.name?.trim()) throw new AppError('Account name is required', 400)

    const code = slugifyCode(input.code || input.name)
    const currency = normalizeCurrency(input.currency)

    const account = await prisma.commercialAccount.create({
      data: {
        name: input.name.trim(),
        code,
        email: input.email || null,
        phone: input.phone || null,
        status: 'ACTIVE',
        currency,
        lowBalanceThreshold: toDecimalString(input.lowBalanceThreshold, '10.0000'),
        criticalBalanceThreshold: toDecimalString(input.criticalBalanceThreshold, '3.0000'),
        hardStopEnabled: true,
        wallet: {
          create: {
            currency,
            availableBalance: '0.0000',
            heldBalance: '0.0000',
            creditLimit: '0.0000',
          },
        },
      },
      include: { wallet: true },
    })

    await audit(actor, 'COMMERCIAL_ACCOUNT_CREATED', 'CommercialAccount', account.id, { code: account.code, name: account.name })
    return account
  },

  async listPaymentRequests(accountId?: number | string | null) {
    const where = accountId ? { accountId: parseId(accountId) } : {}
    return prisma.commercialPaymentRequest.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, code: true, currency: true } },
        requestedPlan: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  },

  async createPaymentRequest(input: CreatePaymentRequestInput, actor?: Actor) {
    await seedCatalog()
    const account = await getAccountOrDefault(input.accountId)
    const amount = toDecimalString(input.amount)
    if (Number(amount) <= 0) throw new AppError('Payment amount must be greater than zero', 400)

    const plan = input.requestedPlanCode
      ? await prisma.commercialPlan.findUnique({ where: { code: input.requestedPlanCode } })
      : null

    if (input.requestedPlanCode && !plan) throw new AppError('Requested plan not found', 404)

    const request = await prisma.commercialPaymentRequest.create({
      data: {
        accountId: account.id,
        requestedPlanId: plan?.id || null,
        amount,
        currency: normalizeCurrency(input.currency || account.currency),
        requestedAddons: input.requestedAddonCodes || [],
        paymentMethod: input.paymentMethod || null,
        paymentReference: input.paymentReference || null,
        proofUrl: input.proofUrl || null,
        notes: input.notes || null,
        status: 'PAYMENT_SUBMITTED',
        createdByUserId: actor?.id || null,
      },
    })

    await audit(actor, 'COMMERCIAL_PAYMENT_REQUEST_CREATED', 'CommercialPaymentRequest', request.id, {
      accountId: account.id,
      amount,
      requestedPlanCode: input.requestedPlanCode,
      requestedAddonCodes: input.requestedAddonCodes || [],
    })

    return request
  },

  async updatePaymentRequestStatus(id: number | string, status: PaymentStatus, actor?: Actor) {
    const requestId = parseId(id)
    const existing = await prisma.commercialPaymentRequest.findUnique({
      where: { id: requestId },
      include: { requestedPlan: true, account: true },
    })
    if (!existing) throw new AppError('Payment request not found', 404)

    const allowedStatuses = new Set<PaymentStatus>(['PENDING_PAYMENT', 'PAYMENT_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'])
    if (!allowedStatuses.has(status)) throw new AppError('Invalid payment request status', 400)

    const updated = await prisma.commercialPaymentRequest.update({
      where: { id: requestId },
      data: {
        status,
        reviewedByUserId: actor?.id || null,
        reviewedAt: new Date(),
      },
      include: { requestedPlan: true, account: true },
    })

    if (status === 'APPROVED') {
      await this.topUpWallet(existing.accountId, {
        amount: existing.amount.toString(),
        description: `Manual payment approved: ${existing.paymentReference || `Request #${existing.id}`}`,
        reference: `payment-request:${existing.id}`,
      }, actor)

      if (existing.requestedPlan) {
        await this.activatePlan(existing.accountId, {
          planCode: existing.requestedPlan.code as CommercialPlanCode,
          status: 'ACTIVE',
          notes: `Activated from approved payment request #${existing.id}`,
        }, actor)
      }

      const requestedAddons = Array.isArray(existing.requestedAddons)
        ? existing.requestedAddons as CommercialAddonCode[]
        : []

      for (const addonCode of requestedAddons) {
        await this.setAddonStatus(existing.accountId, addonCode, {
          status: 'ACTIVE',
          notes: `Activated from approved payment request #${existing.id}`,
        }, actor)
      }
    }

    await audit(actor, 'COMMERCIAL_PAYMENT_REQUEST_STATUS_UPDATED', 'CommercialPaymentRequest', requestId, {
      status,
      accountId: existing.accountId,
    })

    return updated
  },

  async activatePlan(accountId: number | string, input: ActivatePlanInput, actor?: Actor) {
    await seedCatalog()
    const account = await getAccountOrDefault(accountId)
    const plan = await prisma.commercialPlan.findUnique({ where: { code: input.planCode } })
    if (!plan) throw new AppError('Plan not found', 404)

    await prisma.commercialSubscription.updateMany({
      where: { accountId: account.id, status: { in: ['ACTIVE', 'TRIAL'] as any } },
      data: { status: 'EXPIRED', endsAt: new Date() },
    })

    const subscription = await prisma.commercialSubscription.create({
      data: {
        accountId: account.id,
        planId: plan.id,
        status: input.status || 'ACTIVE',
        startsAt: new Date(),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        monthlyFeeOverride: input.monthlyFeeOverride === null || input.monthlyFeeOverride === undefined
          ? null
          : toDecimalString(input.monthlyFeeOverride),
        billingCycle: 'MONTHLY',
        notes: input.notes || null,
      },
      include: { plan: true, account: true },
    })

    await prisma.notification.create({
      data: {
        type: 'COMMERCIAL_PLAN_ACTIVATED',
        title: `${plan.name} plan activated`,
        body: `Commercial account ${account.name} is now on ${plan.name}.`,
        metadata: { accountId: account.id, planCode: plan.code },
      },
    }).catch(() => null)

    await audit(actor, 'COMMERCIAL_PLAN_ACTIVATED', 'CommercialSubscription', subscription.id, {
      accountId: account.id,
      planCode: plan.code,
      status: subscription.status,
    })

    return subscription
  },

  async setAddonStatus(accountId: number | string, addonCode: CommercialAddonCode, input: SetAddonInput, actor?: Actor) {
    await seedCatalog()
    const account = await getAccountOrDefault(accountId)
    const addon = await prisma.commercialAddon.findUnique({ where: { code: addonCode } })
    if (!addon) throw new AppError('Add-on not found', 404)

    const record = await prisma.commercialAccountAddon.upsert({
      where: { accountId_addonId: { accountId: account.id, addonId: addon.id } },
      update: {
        status: input.status,
        priceOverride: input.priceOverride === null || input.priceOverride === undefined ? undefined : toDecimalString(input.priceOverride),
        notes: input.notes === undefined ? undefined : input.notes,
        enabledByUserId: actor?.id || null,
        startsAt: input.status === 'ACTIVE' ? new Date() : undefined,
      },
      create: {
        accountId: account.id,
        addonId: addon.id,
        status: input.status,
        priceOverride: input.priceOverride === null || input.priceOverride === undefined ? null : toDecimalString(input.priceOverride),
        notes: input.notes || null,
        enabledByUserId: actor?.id || null,
        startsAt: input.status === 'ACTIVE' ? new Date() : null,
      },
      include: { addon: true, account: true },
    })

    await audit(actor, 'COMMERCIAL_ADDON_STATUS_UPDATED', 'CommercialAccountAddon', record.id, {
      accountId: account.id,
      addonCode,
      status: input.status,
    })

    return record
  },

  async topUpWallet(accountId: number | string, input: TopUpWalletInput, actor?: Actor) {
    const account = await getAccountOrDefault(accountId)
    const amount = Number(toDecimalString(input.amount))
    if (amount <= 0) throw new AppError('Top-up amount must be greater than zero', 400)

    const result = await prisma.$transaction(async tx => {
      const wallet = await tx.commercialWallet.upsert({
        where: { accountId: account.id },
        update: {},
        create: {
          accountId: account.id,
          currency: account.currency,
          availableBalance: '0.0000',
          heldBalance: '0.0000',
          creditLimit: '0.0000',
        },
      })

      const nextBalance = toMoney(wallet.availableBalance) + amount
      const updatedWallet = await tx.commercialWallet.update({
        where: { id: wallet.id },
        data: { availableBalance: nextBalance.toFixed(4) },
      })

      const transaction = await tx.commercialWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'MANUAL_TOPUP',
          direction: 'CREDIT',
          amount: amount.toFixed(4),
          balanceAfter: nextBalance.toFixed(4),
          referenceType: 'MANUAL_PAYMENT',
          referenceId: input.reference || null,
          description: input.description || 'Manual wallet top-up approved by PTDT Admin',
          metadata: {
            approvedByUserId: actor?.id || null,
            approvedByEmail: actor?.email || null,
          },
          approvedByUserId: actor?.id || null,
        },
      })

      return { wallet: updatedWallet, transaction }
    })

    await evaluateBalanceAlert(account.id)
    await audit(actor, 'COMMERCIAL_WALLET_TOPUP', 'CommercialWallet', result.wallet.id, {
      accountId: account.id,
      amount,
      reference: input.reference || null,
    })

    return result
  },

  async updateThresholds(accountId: number | string, input: ThresholdInput, actor?: Actor) {
    const account = await getAccountOrDefault(accountId)
    const updated = await prisma.commercialAccount.update({
      where: { id: account.id },
      data: {
        ...(input.lowBalanceThreshold !== undefined ? { lowBalanceThreshold: toDecimalString(input.lowBalanceThreshold) } : {}),
        ...(input.criticalBalanceThreshold !== undefined ? { criticalBalanceThreshold: toDecimalString(input.criticalBalanceThreshold) } : {}),
        ...(input.hardStopEnabled !== undefined ? { hardStopEnabled: input.hardStopEnabled } : {}),
      },
    })

    await evaluateBalanceAlert(account.id)
    await audit(actor, 'COMMERCIAL_THRESHOLDS_UPDATED', 'CommercialAccount', account.id, input as Record<string, unknown>)
    return updated
  },
}
