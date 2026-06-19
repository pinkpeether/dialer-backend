CREATE TABLE IF NOT EXISTS "AiCallLog" (
  "id" SERIAL NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'retell',
  "providerCallId" TEXT NOT NULL,
  "lastEvent" TEXT,
  "callStatus" TEXT,
  "callType" TEXT,
  "direction" TEXT,
  "fromNumber" TEXT,
  "toNumber" TEXT,
  "agentId" TEXT,
  "agentName" TEXT,
  "durationMs" INTEGER,
  "disconnectionReason" TEXT,
  "transferDestination" TEXT,
  "transcriptText" TEXT,
  "transcriptLength" INTEGER NOT NULL DEFAULT 0,
  "recordingUrl" TEXT,
  "hasRecordingUrl" BOOLEAN NOT NULL DEFAULT false,
  "callSummary" TEXT,
  "userSentiment" TEXT,
  "callSuccessful" BOOLEAN,
  "inVoicemail" BOOLEAN,
  "callAnalysis" JSONB,
  "rawPayload" JSONB,
  "lastWebhookAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiCallLog_providerCallId_key" ON "AiCallLog"("providerCallId");
CREATE INDEX IF NOT EXISTS "AiCallLog_provider_idx" ON "AiCallLog"("provider");
CREATE INDEX IF NOT EXISTS "AiCallLog_lastEvent_idx" ON "AiCallLog"("lastEvent");
CREATE INDEX IF NOT EXISTS "AiCallLog_callStatus_idx" ON "AiCallLog"("callStatus");
CREATE INDEX IF NOT EXISTS "AiCallLog_direction_idx" ON "AiCallLog"("direction");
CREATE INDEX IF NOT EXISTS "AiCallLog_toNumber_idx" ON "AiCallLog"("toNumber");
CREATE INDEX IF NOT EXISTS "AiCallLog_createdAt_idx" ON "AiCallLog"("createdAt");
