-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PROJECT_MANAGER', 'INSTALLER', 'QA', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "DepartmentType" AS ENUM ('DEPARTMENT_STORE', 'HYPERMARKET', 'SPECIALTY_STORE', 'SHOPPING_MALL', 'OTHER');

-- CreateEnum
CREATE TYPE "StoreRegion" AS ENUM ('BANGKOK', 'UPC');

-- CreateEnum
CREATE TYPE "WorkScope" AS ENUM ('INSTALL_CAMERA', 'INSTALL_LAN', 'INSTALL_POE', 'CALIBRATION', 'TESTING', 'CLOUD_SETUP', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "PlanReadiness" AS ENUM ('PENDING', 'NOT_READY', 'READY', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationTrigger" AS ENUM ('DAILY_AT', 'EVENING_DAY_BEFORE', 'WEEKLY_AT', 'STATUS_CHANGE', 'READINESS_READY', 'NOT_READY_NEAR', 'CAPACITY_OVERFLOW', 'HANDOVER_GENERATED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

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

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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

    CONSTRAINT "InstallationPlan_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerCode_key" ON "Customer"("customerCode");

-- CreateIndex
CREATE INDEX "Customer_customerCode_idx" ON "Customer"("customerCode");

-- CreateIndex
CREATE INDEX "Customer_isActive_idx" ON "Customer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Department_departmentCode_key" ON "Department"("departmentCode");

-- CreateIndex
CREATE INDEX "Department_departmentCode_idx" ON "Department"("departmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE INDEX "InstallationPlan_customerId_idx" ON "InstallationPlan"("customerId");

-- CreateIndex
CREATE INDEX "InstallationPlan_departmentId_idx" ON "InstallationPlan"("departmentId");

-- CreateIndex
CREATE INDEX "InstallationPlan_readiness_idx" ON "InstallationPlan"("readiness");

-- CreateIndex
CREATE INDEX "InstallationPlan_planStatus_idx" ON "InstallationPlan"("planStatus");

-- CreateIndex
CREATE INDEX "InstallationPlan_scheduledDate_idx" ON "InstallationPlan"("scheduledDate");

-- CreateIndex
CREATE INDEX "InstallationPlan_storeRegion_idx" ON "InstallationPlan"("storeRegion");

-- CreateIndex
CREATE INDEX "InstallationPlan_teamId_idx" ON "InstallationPlan"("teamId");

-- CreateIndex
CREATE INDEX "PlanStatusHistory_planId_idx" ON "PlanStatusHistory"("planId");

-- CreateIndex
CREATE INDEX "PlanStatusHistory_changedAt_idx" ON "PlanStatusHistory"("changedAt");

-- CreateIndex
CREATE INDEX "NotificationLog_ruleId_idx" ON "NotificationLog"("ruleId");

-- CreateIndex
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status");

-- CreateIndex
CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog"("sentAt");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationPlan" ADD CONSTRAINT "InstallationPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStatusHistory" ADD CONSTRAINT "PlanStatusHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStatusHistory" ADD CONSTRAINT "PlanStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "NotificationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
