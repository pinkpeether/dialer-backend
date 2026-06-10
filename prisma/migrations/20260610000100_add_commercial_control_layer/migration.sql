-- Phase 4 Sprint 11 — Commercial Control Layer
-- Manual payment approval + subscription plans + wallet ledger + add-ons + low-balance alerts.

CREATE TYPE "CommercialPlanCode" AS ENUM ('BASIC', 'STANDARD', 'PREMIUM', 'ELITE', 'ENTERPRISE');
CREATE TYPE "CommercialAddonCode" AS ENUM ('DYNAMIC_CALLER_ID', 'SMS', 'AI_TRANSCRIPTS', 'AI_INSIGHTS', 'RECORDINGS', 'ADVANCED_ANALYTICS', 'CRM_CONNECTORS');
CREATE TYPE "CommercialSubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'EXPIRED', 'TRIAL');
CREATE TYPE "CommercialFeatureStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL');
CREATE TYPE "CommercialPaymentRequestStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "CommercialWalletTransactionType" AS ENUM ('MANUAL_TOPUP', 'CALL_CHARGE', 'SMS_CHARGE', 'ADJUSTMENT', 'REFUND', 'BONUS_CREDIT', 'HOLD', 'CAPTURE', 'RELEASE');
CREATE TYPE "CommercialWalletTransactionDirection" AS ENUM ('CREDIT', 'DEBIT', 'HOLD', 'RELEASE');
CREATE TYPE "CommercialBillingAlertSeverity" AS ENUM ('INFO', 'LOW_BALANCE', 'CRITICAL_BALANCE', 'HARD_STOP');

CREATE TABLE "CommercialAccount" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "email" TEXT,
  "phone" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "lowBalanceThreshold" DECIMAL(12,4) NOT NULL DEFAULT 10.0000,
  "criticalBalanceThreshold" DECIMAL(12,4) NOT NULL DEFAULT 3.0000,
  "hardStopEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CommercialPlan" (
  "id" SERIAL PRIMARY KEY,
  "code" "CommercialPlanCode" NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "monthlyFee" DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  "includedSeats" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "features" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CommercialSubscription" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "planId" INTEGER NOT NULL,
  "status" "CommercialSubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "monthlyFeeOverride" DECIMAL(12,4),
  "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CommercialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommercialSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommercialPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CommercialAddon" (
  "id" SERIAL PRIMARY KEY,
  "code" "CommercialAddonCode" NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "monthlyFee" DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CommercialAccountAddon" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "addonId" INTEGER NOT NULL,
  "status" "CommercialFeatureStatus" NOT NULL DEFAULT 'INACTIVE',
  "priceOverride" DECIMAL(12,4),
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "enabledByUserId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialAccountAddon_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CommercialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommercialAccountAddon_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "CommercialAddon"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CommercialWallet" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL UNIQUE,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "availableBalance" DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  "heldBalance" DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  "creditLimit" DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialWallet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CommercialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CommercialWalletTransaction" (
  "id" SERIAL PRIMARY KEY,
  "walletId" INTEGER NOT NULL,
  "type" "CommercialWalletTransactionType" NOT NULL,
  "direction" "CommercialWalletTransactionDirection" NOT NULL,
  "amount" DECIMAL(12,4) NOT NULL,
  "balanceAfter" DECIMAL(12,4) NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "description" TEXT,
  "metadata" JSONB,
  "approvedByUserId" INTEGER,
  "idempotencyKey" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialWalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CommercialWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CommercialPaymentRequest" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "requestedPlanId" INTEGER,
  "amount" DECIMAL(12,4) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "requestedAddons" JSONB,
  "paymentMethod" TEXT,
  "paymentReference" TEXT,
  "proofUrl" TEXT,
  "notes" TEXT,
  "status" "CommercialPaymentRequestStatus" NOT NULL DEFAULT 'PAYMENT_SUBMITTED',
  "createdByUserId" INTEGER,
  "reviewedByUserId" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialPaymentRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CommercialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommercialPaymentRequest_requestedPlanId_fkey" FOREIGN KEY ("requestedPlanId") REFERENCES "CommercialPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CommercialBillingAlert" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "severity" "CommercialBillingAlertSeverity" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "balanceAt" DECIMAL(12,4),
  "thresholdValue" DECIMAL(12,4),
  "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialBillingAlert_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CommercialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CommercialAccountAddon_accountId_addonId_key" ON "CommercialAccountAddon"("accountId", "addonId");
CREATE INDEX "CommercialAccount_status_idx" ON "CommercialAccount"("status");
CREATE INDEX "CommercialAccount_createdAt_idx" ON "CommercialAccount"("createdAt");
CREATE INDEX "CommercialPlan_isActive_idx" ON "CommercialPlan"("isActive");
CREATE INDEX "CommercialSubscription_accountId_idx" ON "CommercialSubscription"("accountId");
CREATE INDEX "CommercialSubscription_planId_idx" ON "CommercialSubscription"("planId");
CREATE INDEX "CommercialSubscription_status_idx" ON "CommercialSubscription"("status");
CREATE INDEX "CommercialSubscription_startsAt_idx" ON "CommercialSubscription"("startsAt");
CREATE INDEX "CommercialAddon_isActive_idx" ON "CommercialAddon"("isActive");
CREATE INDEX "CommercialAccountAddon_status_idx" ON "CommercialAccountAddon"("status");
CREATE INDEX "CommercialAccountAddon_enabledByUserId_idx" ON "CommercialAccountAddon"("enabledByUserId");
CREATE INDEX "CommercialWalletTransaction_walletId_idx" ON "CommercialWalletTransaction"("walletId");
CREATE INDEX "CommercialWalletTransaction_type_idx" ON "CommercialWalletTransaction"("type");
CREATE INDEX "CommercialWalletTransaction_direction_idx" ON "CommercialWalletTransaction"("direction");
CREATE INDEX "CommercialWalletTransaction_referenceType_referenceId_idx" ON "CommercialWalletTransaction"("referenceType", "referenceId");
CREATE INDEX "CommercialWalletTransaction_createdAt_idx" ON "CommercialWalletTransaction"("createdAt");
CREATE INDEX "CommercialPaymentRequest_accountId_idx" ON "CommercialPaymentRequest"("accountId");
CREATE INDEX "CommercialPaymentRequest_requestedPlanId_idx" ON "CommercialPaymentRequest"("requestedPlanId");
CREATE INDEX "CommercialPaymentRequest_status_idx" ON "CommercialPaymentRequest"("status");
CREATE INDEX "CommercialPaymentRequest_createdAt_idx" ON "CommercialPaymentRequest"("createdAt");
CREATE INDEX "CommercialBillingAlert_accountId_idx" ON "CommercialBillingAlert"("accountId");
CREATE INDEX "CommercialBillingAlert_severity_idx" ON "CommercialBillingAlert"("severity");
CREATE INDEX "CommercialBillingAlert_isRead_idx" ON "CommercialBillingAlert"("isRead");
CREATE INDEX "CommercialBillingAlert_createdAt_idx" ON "CommercialBillingAlert"("createdAt");
