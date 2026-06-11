-- Phase 4 Sprint 11C — Administration Structure
-- Adds platform/customer role separation and account membership mapping.

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CUSTOMER_ADMIN';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MANAGER';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommercialAccountRole" AS ENUM ('OWNER', 'ADMIN', 'BILLING', 'SUPERVISOR', 'AGENT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommercialAccountMembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CommercialAccountMembership" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "accountRole" "CommercialAccountRole" NOT NULL DEFAULT 'AGENT',
  "status" "CommercialAccountMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "canManageUsers" BOOLEAN NOT NULL DEFAULT false,
  "canManageBilling" BOOLEAN NOT NULL DEFAULT false,
  "canManageCampaigns" BOOLEAN NOT NULL DEFAULT false,
  "canViewReports" BOOLEAN NOT NULL DEFAULT true,
  "canUseDynamicCallerId" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialAccountMembership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CommercialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommercialAccountMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommercialAccountMembership_accountId_userId_key" ON "CommercialAccountMembership"("accountId", "userId");
CREATE INDEX IF NOT EXISTS "CommercialAccountMembership_accountId_idx" ON "CommercialAccountMembership"("accountId");
CREATE INDEX IF NOT EXISTS "CommercialAccountMembership_userId_idx" ON "CommercialAccountMembership"("userId");
CREATE INDEX IF NOT EXISTS "CommercialAccountMembership_accountRole_idx" ON "CommercialAccountMembership"("accountRole");
CREATE INDEX IF NOT EXISTS "CommercialAccountMembership_status_idx" ON "CommercialAccountMembership"("status");
CREATE INDEX IF NOT EXISTS "CommercialAccountMembership_createdAt_idx" ON "CommercialAccountMembership"("createdAt");
