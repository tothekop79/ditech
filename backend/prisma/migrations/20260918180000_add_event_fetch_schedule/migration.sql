-- AlterTable
-- Additive only: every existing Event row stays valid.
--   autoGenerate / fetchTz  NOT NULL but defaulted
--   fetchSchedule / autoSendRuleId  nullable — unset until an event opts into VION
ALTER TABLE "Event" ADD COLUMN     "autoGenerate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoSendRuleId" TEXT,
ADD COLUMN     "fetchSchedule" TEXT,
ADD COLUMN     "fetchTz" TEXT NOT NULL DEFAULT 'Asia/Bangkok';
