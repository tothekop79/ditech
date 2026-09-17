import { z } from 'zod';
import { PlanReadiness, PlanStatus, StoreRegion, WorkScope } from '@prisma/client';

/* ------------------------------------------------------------------ filters */

/** `''` reaches us when a caller forgets to drop an empty select; treat it as absent. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/** `planStatus` and `readiness` arrive as CSV, e.g. "DRAFT,IN_PROGRESS". */
const csvOfEnum = (allowed: readonly string[], field: string) =>
  z.string().refine(
    (v) => v.split(',').map((x) => x.trim()).filter(Boolean).every((x) => allowed.includes(x)),
    { message: `${field} must be a comma-separated list of: ${allowed.join(', ')}` },
  );

/**
 * Filter params the plans list actually accepts.
 *
 * Derived by grepping every caller — PlansListPage, CalendarPage, MapPage,
 * CapacityPage, GanttPage, PrintGanttPage, ProvincesPage and the shared
 * FilterValues type — then cross-checked against the `where` builder in
 * installationPlan.service. Both sides agree on exactly these ten keys.
 *
 * Deliberately NOT included: page, limit, sortBy, sortDir. They shape a page of
 * rows, not a filtered aggregate.
 *
 * Deliberately loose where the callers are loose: `teamId` is a plain string,
 * not a uuid, because the Plans page sends the literal "null" for its
 * "— Unassigned —" option. Tightening it here would 400 a request that the list
 * route accepts today.
 */
export const plansFilterQuerySchema = z.object({
  search: optional(z.string()),
  customerId: optional(z.string()),
  departmentId: optional(z.string()),
  storeRegion: optional(z.nativeEnum(StoreRegion)),
  province: optional(z.string()),
  teamId: optional(z.string()),
  planStatus: optional(csvOfEnum(Object.values(PlanStatus), 'planStatus')),
  readiness: optional(csvOfEnum(Object.values(PlanReadiness), 'readiness')),
  scheduledFrom: optional(z.string()),
  scheduledTo: optional(z.string()),
});

export type PlansFilterQuery = z.infer<typeof plansFilterQuerySchema>;

export const createPlanSchema = z.object({
  customerId: z.string().uuid(),
  departmentId: z.string().uuid(),
  storeName: z.string().min(2),
  branchName: z.string().optional().nullable(),
  storeRegion: z.nativeEnum(StoreRegion).optional().default('BANGKOK'),
  province: z.string().optional(),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional().nullable(),
  contactLine: z.string().optional().nullable(),
  description: z.string().min(2),
  workScope: z.array(z.nativeEnum(WorkScope)).optional(),
  sensorCount: z.number().int().min(0).optional().default(0),
  durationDays: z.number().int().min(1).optional().default(1),
  readiness: z.nativeEnum(PlanReadiness).optional().default('PENDING'),
  readinessNote: z.string().optional(),
  detail: z.string().optional(),
  scheduledDate: z.string().or(z.date()).nullable().optional(),
  teamId: z.string().uuid().optional(),
  contractorName: z.string().optional(),
});

export const updatePlanSchema = z.object({
  storeName: z.string().min(2).optional(),
  branchName: z.string().optional().nullable(),
  storeRegion: z.nativeEnum(StoreRegion).optional(),
  province: z.string().optional(),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional().nullable(),
  contactLine: z.string().optional().nullable(),
  description: z.string().min(2).optional(),
  workScope: z.array(z.nativeEnum(WorkScope)).optional(),
  sensorCount: z.number().int().min(0).optional(),
  sensorModel: z.string().optional().nullable(),
  poeSwitchModel: z.string().optional().nullable(),
  durationDays: z.number().int().min(1).optional(),
  workStartTime: z.string().nullable().optional(),
  workEndTime: z.string().nullable().optional(),
  readiness: z.string().optional(),
  readinessNote: z.string().optional(),
  detail: z.string().optional(),
  trackingResult: z.string().optional(),
  scheduledDate: z.string().or(z.date()).nullable().optional(),
  completedDate: z.string().or(z.date()).nullable().optional(),
  planStatus: z.string().optional(),
  teamId: z.string().uuid().nullable().optional(),
  contractorName: z.string().optional(),
});

export const rescheduleSchema = z.object({
  newDate: z.string(),
});

export const bulkImportSchema = z.object({
  rows: z.array(z.object({
    customerCode: z.string(),
    departmentCode: z.string(),
    storeName: z.string(),
  branchName: z.string().optional().nullable(),
    storeRegion: z.enum(['BANGKOK', 'UPC']).optional(),
    description: z.string().optional().default('install Cam'),
    sensorCount: z.number().int().min(0).optional().default(0),
    readiness: z.enum(['PENDING', 'NOT_READY', 'READY', 'ON_HOLD']).optional(),
    planStatus: z.enum(['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    detail: z.string().optional(),
    scheduledDate: z.string().optional(),
    province: z.string().optional(),
    contactPerson: z.string().optional(),
    contactPhone: z.string().optional(),
  contactEmail: z.string().optional().nullable(),
  contactLine: z.string().optional().nullable(),
    address: z.string().optional(),
  }).passthrough()).min(1),
  mode: z.enum(['create', 'upsert']).optional().default('create'),
});
