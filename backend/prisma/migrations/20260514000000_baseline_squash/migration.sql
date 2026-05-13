-- CreateEnum
CREATE TYPE "DepartmentType" AS ENUM ('DEPARTMENT_STORE', 'HYPERMARKET', 'SPECIALTY_STORE', 'SHOPPING_MALL', 'OTHER');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SIGNED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('WORK_PERMIT', 'INSTALLATION_CONFIRM');

-- CreateEnum
CREATE TYPE "EventProfile" AS ENUM ('SIMPLE', 'STANDARD', 'FULL');

-- CreateEnum
CREATE TYPE "EventReportStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'DATA_COLLECTED', 'REPORT_READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationTrigger" AS ENUM ('DAILY_AT', 'EVENING_DAY_BEFORE', 'WEEKLY_AT', 'STATUS_CHANGE', 'READINESS_READY', 'NOT_READY_NEAR', 'CAPACITY_OVERFLOW', 'HANDOVER_GENERATED', 'RESCHEDULED', 'TEAM_CHANGED', 'PLAN_CREATED', 'PHOTO_UPLOADED', 'EVENT_REPORT_READY');

-- CreateEnum
CREATE TYPE "PlanReadiness" AS ENUM ('PENDING', 'NOT_READY', 'READY', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreRegion" AS ENUM ('BANGKOK', 'UPC');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PROJECT_MANAGER', 'INSTALLER', 'QA', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "WorkScope" AS ENUM ('INSTALL_CAMERA', 'INSTALL_LAN', 'INSTALL_POE', 'CALIBRATION', 'TESTING', 'CLOUD_SETUP', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "CameraModel" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "variant" TEXT,
    "displayName" TEXT NOT NULL,
    "coverageTable" JSONB NOT NULL,
    "minHeight" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "maxHeight" DOUBLE PRECISION NOT NULL DEFAULT 4.6,
    "resolution" TEXT,
    "powerSupply" TEXT,
    "notes" TEXT,
    "supportedFunctions" TEXT[] DEFAULT ARRAY['entrance', 'engagement', 'heatmap']::TEXT[],
    "imageUrl" TEXT,
    "iconColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CameraModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageZone" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "zoneType" TEXT NOT NULL,
    "name" TEXT,
    "linePoints" JSONB,
    "polygon" JSONB,
    "coveragePercent" DOUBLE PRECISION,
    "status" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverageZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contactEmail" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "departmentType" "DepartmentType" NOT NULL DEFAULT 'DEPARTMENT_STORE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "docNumber" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedByName" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "poeCount" INTEGER,
    "workEndTime" TEXT,
    "workStartTime" TEXT,
    "equipmentList" JSONB,
    "handoverChecklist" JSONB,
    "preInstallChecklist" JSONB,
    "workingChecklist" JSONB,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "date" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizer" TEXT,
    "venue" TEXT,
    "venueType" TEXT NOT NULL DEFAULT 'Booth',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNING',
    "profile" "EventProfile" NOT NULL DEFAULT 'FULL',
    "description" TEXT,
    "systemCredit" TEXT NOT NULL DEFAULT 'AI People Counting',
    "confidential" BOOLEAN NOT NULL DEFAULT true,
    "showPasserby" BOOLEAN NOT NULL DEFAULT true,
    "displayHoursStart" INTEGER NOT NULL DEFAULT 9,
    "displayHoursEnd" INTEGER NOT NULL DEFAULT 19,
    "dwellMinSec" INTEGER NOT NULL DEFAULT 0,
    "dwellMaxSec" INTEGER NOT NULL DEFAULT 3600,
    "engagementThresholdSec" INTEGER NOT NULL DEFAULT 60,
    "sponsorZones" TEXT,
    "customerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventActivity" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT,
    "description" TEXT,

    CONSTRAINT "EventActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDay" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#1F77B4',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventGate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gateType" TEXT NOT NULL DEFAULT 'ENTRANCE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReport" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "EventReportStatus" NOT NULL DEFAULT 'QUEUED',
    "profile" TEXT NOT NULL DEFAULT 'full',
    "rawdataPath" TEXT,
    "htmlPath" TEXT,
    "xlsxPath" TEXT,
    "htmlSize" INTEGER,
    "xlsxSize" INTEGER,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "stdout" TEXT,
    "stderr" TEXT,
    "errorMessage" TEXT,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventZone" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbrev" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationDesign" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "eventId" TEXT,
    "siteName" TEXT NOT NULL,
    "storeType" TEXT,
    "designNumber" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1.0',
    "floorPlanUrl" TEXT,
    "floorPlanWidth" INTEGER,
    "floorPlanHeight" INTEGER,
    "ceilingHeight" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "entranceHeight" DOUBLE PRECISION,
    "entranceWidth" DOUBLE PRECISION,
    "scalePxPerMeter" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "designerId" TEXT,
    "checkedById" TEXT,
    "entranceCoveragePercent" DOUBLE PRECISION,
    "engagementCoveragePercent" DOUBLE PRECISION,
    "heatmapCoveragePercent" DOUBLE PRECISION,
    "overallStatus" TEXT,
    "recommendations" JSONB,
    "installationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallationDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationPlan" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeRegion" "StoreRegion" NOT NULL DEFAULT 'BANGKOK',
    "province" TEXT,
    "address" TEXT,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "description" TEXT NOT NULL,
    "workScope" "WorkScope"[],
    "sensorCount" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "readiness" "PlanReadiness" NOT NULL DEFAULT 'PENDING',
    "readinessNote" TEXT,
    "detail" TEXT,
    "trackingResult" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "planStatus" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "teamId" TEXT,
    "assignedById" TEXT,
    "contractorName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branchName" TEXT,
    "poeSwitchModel" TEXT,
    "sensorModel" TEXT,
    "contactEmail" TEXT,
    "contactLine" TEXT,
    "workEndTime" TEXT,
    "workStartTime" TEXT,
    "provinceId" TEXT,
    "regionId" TEXT,
    "eventId" TEXT,

    CONSTRAINT "InstallationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'TELEGRAM',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" "NotificationTrigger" NOT NULL,
    "triggerTime" TEXT,
    "triggerDay" TEXT,
    "triggerCondition" TEXT,
    "daysAhead" INTEGER,
    "recipients" TEXT[],
    "templateBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanStatusHistory" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "fieldChanged" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "PlanStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Province" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameThai" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameThai" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensorPlacement" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "cameraModelId" TEXT NOT NULL,
    "sensorName" TEXT NOT NULL,
    "functionType" TEXT NOT NULL,
    "mountingType" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mountingHeight" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "tiltAngle" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coverageWidth" DOUBLE PRECISION NOT NULL,
    "coverageDepth" DOUBLE PRECISION NOT NULL,
    "coverageOverride" BOOLEAN NOT NULL DEFAULT false,
    "anchorMode" TEXT NOT NULL DEFAULT 'center',
    "obstructionData" JSONB,
    "obstructionPass" BOOLEAN,
    "obstructionNote" TEXT,
    "showAsImage" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PASS',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "color" TEXT,
    "nearEdgeRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.47,
    "coverageMode" TEXT NOT NULL DEFAULT 'rectangle',
    "showDimensions" BOOLEAN NOT NULL DEFAULT true,
    "showDirectionArrow" BOOLEAN NOT NULL DEFAULT true,
    "showLabels" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SensorPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" "StoreRegion" NOT NULL,
    "dailyCap" INTEGER NOT NULL DEFAULT 1,
    "leadUserId" TEXT,
    "telegramChatId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'INSTALLER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "idCard" TEXT,
    "idCardPhotoUrl" TEXT,
    "phoneForDoc" TEXT,
    "position" TEXT,
    "province" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_communication_logs" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "contacted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contact_person" TEXT,
    "summary" TEXT NOT NULL,
    "outcome" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_communication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_photos" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "caption" TEXT,
    "filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CameraModel_brand_modelName_idx" ON "CameraModel"("brand" ASC, "modelName" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CameraModel_brand_modelName_variant_key" ON "CameraModel"("brand" ASC, "modelName" ASC, "variant" ASC);

-- CreateIndex
CREATE INDEX "CameraModel_isActive_idx" ON "CameraModel"("isActive" ASC);

-- CreateIndex
CREATE INDEX "CoverageZone_designId_idx" ON "CoverageZone"("designId" ASC);

-- CreateIndex
CREATE INDEX "CoverageZone_zoneType_idx" ON "CoverageZone"("zoneType" ASC);

-- CreateIndex
CREATE INDEX "Customer_customerCode_idx" ON "Customer"("customerCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerCode_key" ON "Customer"("customerCode" ASC);

-- CreateIndex
CREATE INDEX "Customer_isActive_idx" ON "Customer"("isActive" ASC);

-- CreateIndex
CREATE INDEX "Department_departmentCode_idx" ON "Department"("departmentCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Department_departmentCode_key" ON "Department"("departmentCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Document_docNumber_key" ON "Document"("docNumber" ASC);

-- CreateIndex
CREATE INDEX "Document_docType_idx" ON "Document"("docType" ASC);

-- CreateIndex
CREATE INDEX "Document_planId_idx" ON "Document"("planId" ASC);

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status" ASC);

-- CreateIndex
CREATE INDEX "Event_customerId_idx" ON "Event"("customerId" ASC);

-- CreateIndex
CREATE INDEX "Event_startDate_idx" ON "Event"("startDate" ASC);

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status" ASC);

-- CreateIndex
CREATE INDEX "EventActivity_eventId_date_idx" ON "EventActivity"("eventId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "EventDay_eventId_dayNumber_key" ON "EventDay"("eventId" ASC, "dayNumber" ASC);

-- CreateIndex
CREATE INDEX "EventDay_eventId_idx" ON "EventDay"("eventId" ASC);

-- CreateIndex
CREATE INDEX "EventGate_eventId_idx" ON "EventGate"("eventId" ASC);

-- CreateIndex
CREATE INDEX "EventReport_createdAt_idx" ON "EventReport"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "EventReport_eventId_idx" ON "EventReport"("eventId" ASC);

-- CreateIndex
CREATE INDEX "EventReport_status_idx" ON "EventReport"("status" ASC);

-- CreateIndex
CREATE INDEX "EventZone_eventId_idx" ON "EventZone"("eventId" ASC);

-- CreateIndex
CREATE INDEX "InstallationDesign_eventId_idx" ON "InstallationDesign"("eventId" ASC);

-- CreateIndex
CREATE INDEX "InstallationDesign_overallStatus_idx" ON "InstallationDesign"("overallStatus" ASC);

-- CreateIndex
CREATE INDEX "InstallationDesign_planId_idx" ON "InstallationDesign"("planId" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_customerId_idx" ON "InstallationPlan"("customerId" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_departmentId_idx" ON "InstallationPlan"("departmentId" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_eventId_idx" ON "InstallationPlan"("eventId" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_planStatus_idx" ON "InstallationPlan"("planStatus" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_provinceId_idx" ON "InstallationPlan"("provinceId" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_readiness_idx" ON "InstallationPlan"("readiness" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_regionId_idx" ON "InstallationPlan"("regionId" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_scheduledDate_idx" ON "InstallationPlan"("scheduledDate" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_storeRegion_idx" ON "InstallationPlan"("storeRegion" ASC);

-- CreateIndex
CREATE INDEX "InstallationPlan_teamId_idx" ON "InstallationPlan"("teamId" ASC);

-- CreateIndex
CREATE INDEX "NotificationLog_ruleId_idx" ON "NotificationLog"("ruleId" ASC);

-- CreateIndex
CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog"("sentAt" ASC);

-- CreateIndex
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status" ASC);

-- CreateIndex
CREATE INDEX "PlanStatusHistory_changedAt_idx" ON "PlanStatusHistory"("changedAt" ASC);

-- CreateIndex
CREATE INDEX "PlanStatusHistory_planId_idx" ON "PlanStatusHistory"("planId" ASC);

-- CreateIndex
CREATE INDEX "Province_code_idx" ON "Province"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Province_code_key" ON "Province"("code" ASC);

-- CreateIndex
CREATE INDEX "Province_regionId_idx" ON "Province"("regionId" ASC);

-- CreateIndex
CREATE INDEX "Region_code_idx" ON "Region"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code" ASC);

-- CreateIndex
CREATE INDEX "SensorPlacement_cameraModelId_idx" ON "SensorPlacement"("cameraModelId" ASC);

-- CreateIndex
CREATE INDEX "SensorPlacement_designId_idx" ON "SensorPlacement"("designId" ASC);

-- CreateIndex
CREATE INDEX "SensorPlacement_functionType_idx" ON "SensorPlacement"("functionType" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- CreateIndex
CREATE INDEX "plan_communication_logs_plan_id_idx" ON "plan_communication_logs"("plan_id" ASC);

-- CreateIndex
CREATE INDEX "plan_photos_plan_id_idx" ON "plan_photos"("plan_id" ASC);

-- AddForeignKey
ALTER TABLE "CoverageZone" ADD CONSTRAINT "CoverageZone_designId_fkey" FOREIGN KEY ("designId") REFERENCES "InstallationDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventActivity" ADD CONSTRAINT "EventActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDay" ADD CONSTRAINT "EventDay_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGate" ADD CONSTRAINT "EventGate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventZone" ADD CONSTRAINT "EventZone_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationDesign" ADD CONSTRAINT "InstallationDesign_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationDesign" ADD CONSTRAINT "InstallationDesign_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationDesign" ADD CONSTRAINT "InstallationDesign_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationDesign" ADD CONSTRAINT "InstallationDesign_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallationPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "NotificationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStatusHistory" ADD CONSTRAINT "PlanStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStatusHistory" ADD CONSTRAINT "PlanStatusHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Province" ADD CONSTRAINT "Province_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorPlacement" ADD CONSTRAINT "SensorPlacement_cameraModelId_fkey" FOREIGN KEY ("cameraModelId") REFERENCES "CameraModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorPlacement" ADD CONSTRAINT "SensorPlacement_designId_fkey" FOREIGN KEY ("designId") REFERENCES "InstallationDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_communication_logs" ADD CONSTRAINT "plan_communication_logs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "InstallationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_communication_logs" ADD CONSTRAINT "plan_communication_logs_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_photos" ADD CONSTRAINT "plan_photos_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "InstallationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_photos" ADD CONSTRAINT "plan_photos_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

