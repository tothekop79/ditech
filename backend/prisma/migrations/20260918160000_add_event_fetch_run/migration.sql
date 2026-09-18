-- CreateEnum
CREATE TYPE "EventFetchStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EventFetchTrigger" AS ENUM ('MANUAL', 'SCHEDULE');

-- CreateTable
CREATE TABLE "EventFetchRun" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "EventFetchStatus" NOT NULL DEFAULT 'QUEUED',
    "triggeredBy" "EventFetchTrigger" NOT NULL DEFAULT 'MANUAL',
    "triggeredById" TEXT,
    "force" BOOLEAN NOT NULL DEFAULT false,
    "rows" INTEGER,
    "fullDayRows" INTEGER,
    "reportedTotal" INTEGER,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "EventFetchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventFetchRun_eventId_idx" ON "EventFetchRun"("eventId");

-- CreateIndex
CREATE INDEX "EventFetchRun_eventId_date_idx" ON "EventFetchRun"("eventId", "date");

-- CreateIndex
CREATE INDEX "EventFetchRun_status_idx" ON "EventFetchRun"("status");

-- AddForeignKey
ALTER TABLE "EventFetchRun" ADD CONSTRAINT "EventFetchRun_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

