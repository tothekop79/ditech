-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "showDwellBenchmark" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EventZone" ADD COLUMN     "description" TEXT,
ADD COLUMN     "dwellBenchmarkSec" INTEGER;
