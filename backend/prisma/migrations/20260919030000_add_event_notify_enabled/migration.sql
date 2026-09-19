-- AlterTable
-- Additive: NOT NULL but defaulted true, so every existing event keeps notifying as before.
ALTER TABLE "Event" ADD COLUMN     "notifyEnabled" BOOLEAN NOT NULL DEFAULT true;
