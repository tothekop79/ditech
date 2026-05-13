import { z } from 'zod';

// ═══════════════════════════════════════════════════
// Camera Model schemas
// ═══════════════════════════════════════════════════
export const coverageRowSchema = z.object({
  height: z.number().positive(),
  width: z.number().positive(),
  depth: z.number().positive(),
});

export const createCameraModelSchema = z.object({
  brand: z.string().min(1).max(100),
  modelName: z.string().min(1).max(100),
  variant: z.string().max(100).nullable().optional(),
  displayName: z.string().min(1).max(200),
  coverageTable: z.array(coverageRowSchema).min(1),
  minHeight: z.number().positive().default(2.5),
  maxHeight: z.number().positive().default(4.6),
  resolution: z.string().nullable().optional(),
  powerSupply: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  supportedFunctions: z.array(z.string()).default(['entrance', 'engagement', 'heatmap']),
  iconColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export const updateCameraModelSchema = createCameraModelSchema.partial();

// ═══════════════════════════════════════════════════
// Installation Design schemas
// ═══════════════════════════════════════════════════
export const createDesignSchema = z.object({
  planId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  siteName: z.string().min(1).max(200),
  storeType: z.string().nullable().optional(),
  designNumber: z.string().nullable().optional(),
  version: z.string().default('v1.0'),
  ceilingHeight: z.number().positive().min(2).max(10).default(3.5),
  entranceHeight: z.number().positive().nullable().optional(),
  entranceWidth: z.number().positive().nullable().optional(),
  scalePxPerMeter: z.number().positive().default(20),
  installationNote: z.string().nullable().optional(),
});

export const updateDesignSchema = createDesignSchema.partial().extend({
  designerId: z.string().uuid().nullable().optional(),
  checkedById: z.string().uuid().nullable().optional(),
});

// ═══════════════════════════════════════════════════
// Sensor Placement schemas
// ═══════════════════════════════════════════════════
export const sensorFunctionEnum = z.enum([
  'entrance', 'engagement', 'heatmap', 'cctv', 'passerby', 'zone',
]);
export const mountingTypeEnum = z.enum([
  'embedded', 'surface', 'bracket', 'tilt_bracket',
]);
export const anchorModeEnum = z.enum(['center', 'dynamic_tilt']);

export const createSensorSchema = z.object({
  cameraModelId: z.string().uuid(),
  sensorName: z.string().min(1).max(50),
  functionType: sensorFunctionEnum,
  mountingType: mountingTypeEnum.default('embedded'),
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
  mountingHeight: z.number().positive().min(1).max(10).default(3.5),
  tiltAngle: z.number().min(-45).max(45).default(0),
  coverageWidth: z.number().positive().optional(),    // auto-computed if absent
  coverageDepth: z.number().positive().optional(),
  coverageOverride: z.boolean().default(false),
  anchorMode: anchorModeEnum.default('center'),
  // C1.10c - fields previously silent-dropped by Zod
  color: z.string().nullable().optional(),
  nearEdgeRatio: z.number().min(0.05).max(1.0).optional(),
  coverageMode: z.enum(['rectangle', 'tilt_projection']).optional(),
  showLabels: z.boolean().optional(),
  showDimensions: z.boolean().optional(),
  showDirectionArrow: z.boolean().optional(),
  obstructionData: z.record(z.any()).nullable().optional(),
  showAsImage: z.boolean().default(false),
  note: z.string().nullable().optional(),
  // C1.10d#2 — Transient flag: client requests backend to recompute
  // coverageWidth/Depth/nearEdgeRatio from current model + height + tilt + mode.
  // NOT persisted to DB; consumed by service layer recompute trigger only.
  recomputeCoverage: z.boolean().optional(),
});

export const updateSensorSchema = createSensorSchema.partial();

// ═══════════════════════════════════════════════════
// Coverage Zone schemas
// ═══════════════════════════════════════════════════
export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const zoneTypeEnum = z.enum([
  'entrance_line', 'engagement_area', 'heatmap_area', 'walking_area', 'obstruction',
]);

export const createZoneSchema = z.object({
  zoneType: zoneTypeEnum,
  name: z.string().nullable().optional(),
  linePoints: z.array(pointSchema).length(2).nullable().optional(),
  polygon: z.array(pointSchema).min(3).nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
}).refine(
  (data) => Boolean(data.linePoints) !== Boolean(data.polygon),
  { message: 'Exactly one of linePoints or polygon must be provided' },
);

export const updateZoneSchema = z.object({
  zoneType: zoneTypeEnum.optional(),
  name: z.string().nullable().optional(),
  linePoints: z.array(pointSchema).length(2).nullable().optional(),
  polygon: z.array(pointSchema).min(3).nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
});

// ═══════════════════════════════════════════════════
// Type exports
// ═══════════════════════════════════════════════════
export type CreateCameraModelDTO = z.infer<typeof createCameraModelSchema>;
export type UpdateCameraModelDTO = z.infer<typeof updateCameraModelSchema>;
export type CreateDesignDTO = z.infer<typeof createDesignSchema>;
export type UpdateDesignDTO = z.infer<typeof updateDesignSchema>;
export type CreateSensorDTO = z.infer<typeof createSensorSchema>;
export type UpdateSensorDTO = z.infer<typeof updateSensorSchema>;
export type CreateZoneDTO = z.infer<typeof createZoneSchema>;
export type UpdateZoneDTO = z.infer<typeof updateZoneSchema>;
