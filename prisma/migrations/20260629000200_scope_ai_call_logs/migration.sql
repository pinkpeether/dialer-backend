-- Scope AI call logs by commercial account/requesting user.
-- Existing rows stay NULL and remain platform-only until new scoped AI calls are created.

ALTER TABLE "AiCallLog"
  ADD COLUMN IF NOT EXISTS "commercialAccountId" INTEGER,
  ADD COLUMN IF NOT EXISTS "requestedByUserId" INTEGER;

CREATE INDEX IF NOT EXISTS "AiCallLog_commercialAccountId_idx"
  ON "AiCallLog"("commercialAccountId");

CREATE INDEX IF NOT EXISTS "AiCallLog_requestedByUserId_idx"
  ON "AiCallLog"("requestedByUserId");
