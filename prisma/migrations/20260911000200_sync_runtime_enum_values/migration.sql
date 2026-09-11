-- Align PostgreSQL enum values with the current Prisma schema/runtime.
-- This migration is intentionally additive only; removing legacy enum values
-- requires a separate data-cleanup migration and table rewrites.

ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'ONLINE';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'BUSY';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'WRAP_UP';

ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';

ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'CALLING';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'CONTACTED';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'ANSWERED';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'NO_ANSWER';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'BUSY';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'DONE';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'VOICEMAIL';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'WRONG_NUMBER';
ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'DNC';
