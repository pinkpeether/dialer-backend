CREATE TABLE "spoofing_numbers" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "campaign_id" INTEGER,
    "display_number" VARCHAR(20) NOT NULL,
    "display_name" VARCHAR(100),
    "provider" VARCHAR(40) NOT NULL DEFAULT 'generic',
    "provider_ref" VARCHAR(120),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'all',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spoofing_numbers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spoofing_numbers_user_id_idx" ON "spoofing_numbers"("user_id");
CREATE INDEX "spoofing_numbers_campaign_id_idx" ON "spoofing_numbers"("campaign_id");
CREATE INDEX "spoofing_numbers_is_active_idx" ON "spoofing_numbers"("is_active");
CREATE INDEX "spoofing_numbers_is_verified_idx" ON "spoofing_numbers"("is_verified");

ALTER TABLE "spoofing_numbers"
ADD CONSTRAINT "spoofing_numbers_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "spoofing_numbers"
ADD CONSTRAINT "spoofing_numbers_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
