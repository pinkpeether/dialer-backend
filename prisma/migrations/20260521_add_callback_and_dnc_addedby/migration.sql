-- Add addedByUserId to DNCList
ALTER TABLE "DNCList" ADD COLUMN IF NOT EXISTS "addedByUserId" INTEGER;
ALTER TABLE "DNCList" ADD CONSTRAINT "DNCList_addedByUserId_fkey"
  FOREIGN KEY ("addedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Create Callback table
CREATE TABLE IF NOT EXISTS "Callback" (
  "id"          SERIAL PRIMARY KEY,
  "contactId"   INTEGER,
  "callId"      INTEGER,
  "agentId"     INTEGER NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "notes"       TEXT,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Callback_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Callback_callId_fkey"    FOREIGN KEY ("callId")    REFERENCES "Call"("id")    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Callback_agentId_fkey"   FOREIGN KEY ("agentId")   REFERENCES "User"("id")   ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Index for scheduled lookups
CREATE INDEX IF NOT EXISTS "Callback_scheduledAt_idx" ON "Callback"("scheduledAt");
CREATE INDEX IF NOT EXISTS "Callback_agentId_status_idx" ON "Callback"("agentId", "status");
