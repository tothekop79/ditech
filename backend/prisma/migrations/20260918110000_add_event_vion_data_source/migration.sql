-- CreateEnum
CREATE TYPE "EventDataSource" AS ENUM ('UPLOAD', 'VION');

-- CreateEnum
CREATE TYPE "VionServerKey" AS ENUM ('MALL', 'RETAIL');

-- AlterTable
-- Additive only: every existing Event row stays valid.
--   dataSource  NOT NULL but DEFAULT 'UPLOAD'  → existing rows keep the v1 upload path
--   vionServer / vionPlazaId  nullable         → unset until a user opts an event into VION
ALTER TABLE "Event" ADD COLUMN     "dataSource" "EventDataSource" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "vionPlazaId" TEXT,
ADD COLUMN     "vionServer" "VionServerKey";
