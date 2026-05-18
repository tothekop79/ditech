-- AlterTable
ALTER TABLE "SensorPlacement" ADD COLUMN     "depthRatio" DOUBLE PRECISION,
ADD COLUMN     "farWidthRatio" DOUBLE PRECISION,
ADD COLUMN     "ratioOverride" BOOLEAN NOT NULL DEFAULT false;
