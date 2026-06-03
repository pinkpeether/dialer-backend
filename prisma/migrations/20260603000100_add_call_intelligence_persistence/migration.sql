-- Phase 4 Sprint 8: Call Intelligence persistence
-- Safe additive migration: creates transcript/insight tables only.

CREATE TABLE "CallTranscript" (
    "id" SERIAL NOT NULL,
    "callId" INTEGER NOT NULL,
    "transcriptText" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "language" TEXT,
    "durationSeconds" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallTranscript_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CallInsight" (
    "id" SERIAL NOT NULL,
    "callId" INTEGER NOT NULL,
    "summary" TEXT,
    "sentiment" TEXT,
    "score" DOUBLE PRECISION,
    "intent" TEXT,
    "objections" JSONB,
    "actionItems" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallTranscript_callId_key" ON "CallTranscript"("callId");
CREATE INDEX "CallTranscript_status_idx" ON "CallTranscript"("status");
CREATE INDEX "CallTranscript_provider_idx" ON "CallTranscript"("provider");
CREATE INDEX "CallTranscript_generatedAt_idx" ON "CallTranscript"("generatedAt");

CREATE UNIQUE INDEX "CallInsight_callId_key" ON "CallInsight"("callId");
CREATE INDEX "CallInsight_sentiment_idx" ON "CallInsight"("sentiment");
CREATE INDEX "CallInsight_status_idx" ON "CallInsight"("status");
CREATE INDEX "CallInsight_generatedAt_idx" ON "CallInsight"("generatedAt");

ALTER TABLE "CallTranscript"
ADD CONSTRAINT "CallTranscript_callId_fkey"
FOREIGN KEY ("callId") REFERENCES "Call"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallInsight"
ADD CONSTRAINT "CallInsight_callId_fkey"
FOREIGN KEY ("callId") REFERENCES "Call"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
