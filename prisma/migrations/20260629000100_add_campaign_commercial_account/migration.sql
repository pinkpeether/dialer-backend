-- Add nullable commercial account ownership to campaigns.
-- Existing platform/global campaigns stay NULL and remain visible to platform admins only.

ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "commercialAccountId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Campaign_commercialAccountId_fkey'
  ) THEN
    ALTER TABLE "Campaign"
      ADD CONSTRAINT "Campaign_commercialAccountId_fkey"
      FOREIGN KEY ("commercialAccountId")
      REFERENCES "CommercialAccount"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Campaign_commercialAccountId_idx"
  ON "Campaign"("commercialAccountId");
