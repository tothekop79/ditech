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
CREATE INDEX "plan_communication_logs_plan_id_idx" ON "plan_communication_logs"("plan_id");

-- CreateIndex
CREATE INDEX "plan_photos_plan_id_idx" ON "plan_photos"("plan_id");

-- AddForeignKey
ALTER TABLE "plan_communication_logs" ADD CONSTRAINT "plan_communication_logs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "InstallationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_communication_logs" ADD CONSTRAINT "plan_communication_logs_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_photos" ADD CONSTRAINT "plan_photos_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "InstallationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_photos" ADD CONSTRAINT "plan_photos_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
