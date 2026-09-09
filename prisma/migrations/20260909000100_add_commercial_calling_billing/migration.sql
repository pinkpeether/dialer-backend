CREATE TYPE "CommercialCallAuthorizationStatus" AS ENUM ('HELD', 'SETTLED', 'RELEASED');

ALTER TABLE "CommercialWallet"
  ADD COLUMN "includedSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "heldIncludedSeconds" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CommercialProviderWallet" (
  "id" SERIAL NOT NULL,
  "provider" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "availableBalance" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "reserveBalance" DECIMAL(12,4) NOT NULL DEFAULT 5,
  "enforcementEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialProviderWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialProviderWallet_provider_key" ON "CommercialProviderWallet"("provider");

CREATE TABLE "CommercialCallingRate" (
  "id" SERIAL NOT NULL,
  "destinationCode" TEXT NOT NULL,
  "destinationName" TEXT NOT NULL,
  "dialPrefix" TEXT NOT NULL,
  "carrierRatePerMinute" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "customerRatePerMinute" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "minimumSeconds" INTEGER NOT NULL DEFAULT 60,
  "incrementSeconds" INTEGER NOT NULL DEFAULT 60,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialCallingRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialCallingRate_destinationCode_key" ON "CommercialCallingRate"("destinationCode");
CREATE INDEX "CommercialCallingRate_isActive_idx" ON "CommercialCallingRate"("isActive");

CREATE TABLE "CommercialCallAuthorization" (
  "id" TEXT NOT NULL,
  "accountId" INTEGER NOT NULL,
  "walletId" INTEGER NOT NULL,
  "callId" INTEGER NOT NULL,
  "rateId" INTEGER NOT NULL,
  "destination" TEXT NOT NULL,
  "heldAmount" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "heldIncludedSeconds" INTEGER NOT NULL DEFAULT 0,
  "status" "CommercialCallAuthorizationStatus" NOT NULL DEFAULT 'HELD',
  "settledAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialCallAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialCallAuthorization_callId_key" ON "CommercialCallAuthorization"("callId");
CREATE INDEX "CommercialCallAuthorization_accountId_idx" ON "CommercialCallAuthorization"("accountId");
CREATE INDEX "CommercialCallAuthorization_walletId_idx" ON "CommercialCallAuthorization"("walletId");
CREATE INDEX "CommercialCallAuthorization_status_idx" ON "CommercialCallAuthorization"("status");

ALTER TABLE "CommercialCallAuthorization"
  ADD CONSTRAINT "CommercialCallAuthorization_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CommercialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialCallAuthorization_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CommercialWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialCallAuthorization_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommercialCallAuthorization_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "CommercialCallingRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
