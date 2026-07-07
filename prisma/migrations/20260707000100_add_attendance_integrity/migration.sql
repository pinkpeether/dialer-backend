-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM (
  'CLOCKED_IN',
  'CLOCKED_OUT',
  'IDLE',
  'ON_BREAK',
  'UNEXPECTED_DISCONNECT',
  'MISSED_CLOCK_OUT',
  'FLAGGED',
  'PENDING_SUPERVISOR_REVIEW'
);

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM (
  'CLOCK_IN',
  'CLOCK_OUT',
  'HEARTBEAT',
  'BROWSER_CLOSED',
  'RECONNECT',
  'DISCONNECT',
  'IDLE_STARTED',
  'IDLE_ENDED',
  'BREAK_STARTED',
  'BREAK_ENDED',
  'SUPERVISOR_OVERRIDE',
  'MANUAL_CORRECTION'
);

-- CreateTable
CREATE TABLE "AttendanceSession" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "sessionKey" TEXT NOT NULL,
  "clockInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clockOutAt" TIMESTAMP(3),
  "totalWorkedSeconds" INTEGER NOT NULL DEFAULT 0,
  "totalBreakSeconds" INTEGER NOT NULL DEFAULT 0,
  "productiveSeconds" INTEGER NOT NULL DEFAULT 0,
  "idleSeconds" INTEGER NOT NULL DEFAULT 0,
  "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'CLOCKED_IN',
  "browser" TEXT,
  "operatingSystem" TEXT,
  "publicIp" TEXT,
  "localIp" TEXT,
  "timezone" TEXT,
  "deviceFingerprint" TEXT,
  "userAgent" TEXT,
  "lastHeartbeatAt" TIMESTAMP(3),
  "disconnectCount" INTEGER NOT NULL DEFAULT 0,
  "redFlag" BOOLEAN NOT NULL DEFAULT false,
  "redFlagReason" TEXT,
  "supervisorNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEvent" (
  "id" SERIAL NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "type" "AttendanceEventType" NOT NULL,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSession_sessionKey_key" ON "AttendanceSession"("sessionKey");

-- CreateIndex
CREATE INDEX "AttendanceSession_userId_idx" ON "AttendanceSession"("userId");

-- CreateIndex
CREATE INDEX "AttendanceSession_status_idx" ON "AttendanceSession"("status");

-- CreateIndex
CREATE INDEX "AttendanceSession_clockInAt_idx" ON "AttendanceSession"("clockInAt");

-- CreateIndex
CREATE INDEX "AttendanceSession_lastHeartbeatAt_idx" ON "AttendanceSession"("lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "AttendanceSession_redFlag_idx" ON "AttendanceSession"("redFlag");

-- CreateIndex
CREATE INDEX "AttendanceEvent_sessionId_idx" ON "AttendanceEvent"("sessionId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_userId_idx" ON "AttendanceEvent"("userId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_type_idx" ON "AttendanceEvent"("type");

-- CreateIndex
CREATE INDEX "AttendanceEvent_createdAt_idx" ON "AttendanceEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
