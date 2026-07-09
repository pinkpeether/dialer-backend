-- Persist browser SIP registration state so supervisor/admin views do not infer it from attendance.
CREATE TABLE IF NOT EXISTS "SipPresence" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "registered" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "username" TEXT,
  "transport" TEXT,
  "domain" TEXT,
  "webSocketServer" TEXT,
  "lastRegisteredAt" TIMESTAMP(3),
  "lastUnregisteredAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SipPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SipPresence_status_idx" ON "SipPresence"("status");
CREATE INDEX IF NOT EXISTS "SipPresence_registered_idx" ON "SipPresence"("registered");
CREATE INDEX IF NOT EXISTS "SipPresence_lastSeenAt_idx" ON "SipPresence"("lastSeenAt");
