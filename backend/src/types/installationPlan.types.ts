import { PlanReadiness, PlanStatus, StoreRegion, WorkScope } from '@prisma/client';

export interface CreateInstallationPlanDTO {
  customerId: string;
  departmentId: string;
  storeName: string;
  branchName?: string;
  storeRegion?: StoreRegion;
  province?: string;
  address?: string;
  contactPerson?: string;
  contactPhone?: string;
  description: string;
  workScope?: WorkScope[];
  sensorCount?: number;
  durationDays?: number;
  readiness?: PlanReadiness;
  readinessNote?: string;
  detail?: string;
  scheduledDate?: string | Date;
  teamId?: string;
  contractorName?: string;
}

export interface UpdateInstallationPlanDTO {
  storeName?: string;
  storeRegion?: StoreRegion;
  province?: string;
  address?: string;
  contactPerson?: string;
  contactPhone?: string;
  description?: string;
  workScope?: WorkScope[];
  sensorCount?: number;
  durationDays?: number;
  readiness?: PlanReadiness;
  readinessNote?: string;
  detail?: string;
  trackingResult?: string;
  scheduledDate?: string | Date;
  completedDate?: string | Date;
  planStatus?: PlanStatus;
  teamId?: string;
  contractorName?: string;
}

export interface InstallationPlanQuery {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  departmentId?: string;
  storeRegion?: StoreRegion;
  province?: string;
  readiness?: PlanReadiness;
  planStatus?: PlanStatus;
  teamId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface BulkImportRow {
  customerCode: string;
  departmentCode: string;
  storeName: string;
  branchName?: string;
  storeRegion?: 'BANGKOK' | 'UPC';
  description: string;
  sensorCount: number;
  readiness?: 'PENDING' | 'NOT_READY' | 'READY' | 'ON_HOLD';
  detail?: string;
  scheduledDate?: string;
  province?: string;
}
