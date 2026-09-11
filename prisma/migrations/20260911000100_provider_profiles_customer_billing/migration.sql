ALTER TABLE "CommercialProviderWallet"
ADD COLUMN "displayName" TEXT,
ADD COLUMN "providerType" TEXT NOT NULL DEFAULT 'SIP_TRUNK',
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "balanceMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "trunkName" TEXT,
ADD COLUMN "apiBaseUrl" TEXT,
ADD COLUMN "apiUsername" TEXT,
ADD COLUMN "apiName" TEXT,
ADD COLUMN "apiKeyLabel" TEXT,
ADD COLUMN "apiSecretLabel" TEXT,
ADD COLUMN "passwordLabel" TEXT,
ADD COLUMN "docsUrl" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "lastBalanceSyncAt" TIMESTAMP(3),
ADD COLUMN "lastBalanceSyncStatus" TEXT,
ADD COLUMN "lastBalanceSyncError" TEXT;

UPDATE "CommercialProviderWallet"
SET
  "displayName" = COALESCE("displayName", 'illyVoIP'),
  "providerType" = COALESCE("providerType", 'SIP_TRUNK'),
  "status" = COALESCE("status", 'ACTIVE'),
  "balanceMode" = COALESCE("balanceMode", 'MANUAL'),
  "trunkName" = COALESCE("trunkName", 'illyvoip-out'),
  "apiName" = COALESCE("apiName", 'SMS API only'),
  "notes" = COALESCE("notes", 'Calling API docs are currently unavailable; provider balance is maintained manually until a provider adapter is available.')
WHERE "provider" = 'ILLYVOIP';
