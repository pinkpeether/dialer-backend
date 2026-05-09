/*
  Warnings:

  - You are about to drop the column `connectedAt` on the `Call` table. All the data in the column will be lost.
  - You are about to drop the column `recordingSid` on the `Call` table. All the data in the column will be lost.
  - You are about to drop the column `recordingUrl` on the `Call` table. All the data in the column will be lost.
  - You are about to drop the column `sentiment` on the `Call` table. All the data in the column will be lost.
  - You are about to drop the column `twilioCallSid` on the `Call` table. All the data in the column will be lost.
  - The `status` column on the `Call` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `disposition` column on the `Call` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `description` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `dialRatio` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `maxRetries` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `retryDelay` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `script` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `timezone` on the `Campaign` table. All the data in the column will be lost.
  - The `status` column on the `Campaign` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `company` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `lastCalledAt` on the `Contact` table. All the data in the column will be lost.
  - The `status` column on the `Contact` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `agentCode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `extension` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.
  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `dNCList` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `callerId` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('AVAILABLE', 'ON_CALL', 'BREAK', 'OFFLINE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('PENDING', 'IN_QUEUE', 'IN_CALL', 'COMPLETED', 'FAILED', 'CALLBACK');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('INITIATED', 'RINGING', 'ANSWERED', 'NO_ANSWER', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CallDisposition" AS ENUM ('ANSWERED', 'NO_ANSWER', 'VOICEMAIL', 'CALLBACK', 'WRONG_NUMBER', 'DO_NOT_CALL');

-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('ACTIVE', 'IDLE', 'DISCONNECTED');

-- DropIndex
DROP INDEX "User_agentCode_key";

-- AlterTable
ALTER TABLE "Call" DROP COLUMN "connectedAt",
DROP COLUMN "recordingSid",
DROP COLUMN "recordingUrl",
DROP COLUMN "sentiment",
DROP COLUMN "twilioCallSid",
ADD COLUMN     "providerCallId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "CallStatus" NOT NULL DEFAULT 'INITIATED',
DROP COLUMN "disposition",
ADD COLUMN     "disposition" "CallDisposition";

-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "description",
DROP COLUMN "dialRatio",
DROP COLUMN "endTime",
DROP COLUMN "maxRetries",
DROP COLUMN "retryDelay",
DROP COLUMN "script",
DROP COLUMN "startTime",
DROP COLUMN "timezone",
ADD COLUMN     "callerId" TEXT NOT NULL,
ADD COLUMN     "dialingRatio" INTEGER NOT NULL DEFAULT 1,
DROP COLUMN "status",
ADD COLUMN     "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "company",
DROP COLUMN "lastCalledAt",
ADD COLUMN     "callbackAt" TIMESTAMP(3),
ADD COLUMN     "maxRetries" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "notes" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "ContactStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "agentCode",
DROP COLUMN "extension",
DROP COLUMN "isActive",
DROP COLUMN "password",
DROP COLUMN "phone",
ADD COLUMN     "passwordHash" TEXT NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'AGENT',
DROP COLUMN "status",
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'OFFLINE';

-- DropTable
DROP TABLE "dNCList";

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" SERIAL NOT NULL,
    "agentId" INTEGER NOT NULL,
    "socketId" TEXT NOT NULL,
    "status" "AgentSessionStatus" NOT NULL DEFAULT 'IDLE',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DNCList" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DNCList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DNCList_phone_key" ON "DNCList"("phone");

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
