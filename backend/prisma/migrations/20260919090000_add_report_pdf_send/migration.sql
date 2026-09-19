-- AlterTable
-- Additive only. sendFile defaults to false, so every existing rule keeps sending
-- exactly the message it sent before; the two EventReport columns are nullable.
ALTER TABLE "EventReport" ADD COLUMN     "telegramFileError" TEXT,
ADD COLUMN     "telegramFileSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationRule" ADD COLUMN     "sendFile" BOOLEAN NOT NULL DEFAULT false;
