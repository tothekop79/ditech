import { api } from './client';
import type { CameraModel } from './cameraModels';

// ════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════
export type Point = { x: number; y: number };

export type SensorFunction = 'entrance' | 'engagement' | 'heatmap' | 'cctv' | 'passerby' | 'zone';
export type MountingType = 'embedded' | 'surface' | 'bracket' | 'tilt_bracket';
export type AnchorMode = 'center' | 'dynamic_tilt';
export type CoverageMode = 'rectangle' | 'tilt_projection' | 'cone';
export type ZoneType = 'entrance_line' | 'engagement_area' | 'heatmap_area' | 'walking_area' | 'obstruction';
export type DesignStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface SensorPlacement {
  id: string;
  designId: string;
  cameraModelId: string;
  sensorName: string;
  functionType: SensorFunction;
  mountingType: MountingType;
  x: number;
  y: number;
  rotation: number;
  mountingHeight: number;
  tiltAngle: number;
  coverageWidth: number;
  coverageDepth: number;
  coverageOverride: boolean;
  anchorMode: AnchorMode;
  // C1.5 new fields:
  color: string | null;             // Per-sensor color override (hex)
  nearEdgeRatio: number;            // Trapezoid near/far ratio (0.05-1.0, default 0.47)

  obstructionData: any | null;
  obstructionPass: boolean | null;
  obstructionNote: string | null;
  showAsImage: boolean;
  status: 'PASS' | 'WARNING' | 'FAIL';
  note: string | null;
  // C1.8 — Coverage rendering options (added in backend, now reflected here
  // to remove (s as any) casts in SensorSettingsPanel — PROJECT_STATE roadmap L229-232)
  coverageMode: CoverageMode;
  showLabels: boolean;
  showDimensions: boolean;
  showDirectionArrow: boolean;
  // C1.10d#3 — Manual trapezoid ratio override (tilt_projection only)
  ratioOverride: boolean;
  farWidthRatio: number | null;
  depthRatio: number | null;
  cameraModel?: Pick<CameraModel, 'id' | 'displayName' | 'iconColor' | 'imageUrl'>;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageZone {
  id: string;
  designId: string;
  zoneType: ZoneType;
  name: string | null;
  linePoints: [Point, Point] | null;
  polygon: Point[] | null;
  coveragePercent: number | null;
  status: string | null;
  metadata: any | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstallationDesign {
  id: string;
  planId: string | null;
  eventId: string | null;
  siteName: string;
  storeType: string | null;
  designNumber: string | null;
  version: string;
  floorPlanUrl: string | null;
  floorPlanWidth: number | null;
  floorPlanHeight: number | null;
  ceilingHeight: number;
  entranceHeight: number | null;
  entranceWidth: number | null;
  scalePxPerMeter: number;
  designerId: string | null;
  checkedById: string | null;
  entranceCoveragePercent: number | null;
  engagementCoveragePercent: number | null;
  heatmapCoveragePercent: number | null;
  overallStatus: DesignStatus | null;
  recommendations: string[] | null;
  installationNote: string | null;
  designer?: { id: string; fullName: string; email: string } | null;
  checkedBy?: { id: string; fullName: string; email: string } | null;
  plan?: { id: string; storeName: string; branchName: string | null } | null;
  event?: { id: string; name: string } | null;
  sensors?: SensorPlacement[];
  zones?: CoverageZone[];
  _count?: { sensors: number; zones: number };
  createdAt: string;
  updatedAt: string;
}

export interface CreateDesignDTO {
  planId?: string | null;
  eventId?: string | null;
  siteName: string;
  storeType?: string | null;
  ceilingHeight?: number;
  entranceHeight?: number | null;
  entranceWidth?: number | null;
  scalePxPerMeter?: number;
  installationNote?: string | null;
}

export interface UpdateDesignDTO extends Partial<CreateDesignDTO> {
  designerId?: string | null;
  checkedById?: string | null;
  version?: string;
}

export interface CreateSensorDTO {
  cameraModelId: string;
  sensorName: string;
  functionType: SensorFunction;
  mountingType?: MountingType;
  x: number;
  y: number;
  rotation?: number;
  mountingHeight?: number;
  tiltAngle?: number;
  coverageWidth?: number;
  coverageDepth?: number;
  coverageOverride?: boolean;
  anchorMode?: AnchorMode;
  color?: string | null;
  nearEdgeRatio?: number;
  obstructionData?: any;
  showAsImage?: boolean;
  note?: string | null;
  // C1.8 — Coverage rendering options
  coverageMode?: CoverageMode;
  showLabels?: boolean;
  showDimensions?: boolean;
  showDirectionArrow?: boolean;
  // C1.10d#3 — Manual trapezoid ratio override
  ratioOverride?: boolean;
  farWidthRatio?: number | null;
  depthRatio?: number | null;
}

export type UpdateSensorDTO = Partial<CreateSensorDTO> & {
  status?: 'PASS' | 'WARNING' | 'FAIL';
  obstructionPass?: boolean | null;
  // C1.10d#2 — Transient: tells backend to recompute coverage from current
  // model + height + tilt + mode. Not persisted.
  recomputeCoverage?: boolean;
};

export interface CreateZoneDTO {
  zoneType: ZoneType;
  name?: string | null;
  linePoints?: [Point, Point] | null;
  polygon?: Point[] | null;
  metadata?: any;
}

export type UpdateZoneDTO = Partial<CreateZoneDTO>;

// ════════════════════════════════════════════════
// API
// ════════════════════════════════════════════════
export const designsApi = {
  // ── Designs ──
  list: (filters?: { planId?: string; eventId?: string; designerId?: string; status?: string }) =>
    api.get<{ success: boolean; data: InstallationDesign[] }>('/designs', { params: filters }).then(r => r.data.data),

  get: (id: string) =>
    api.get<{ success: boolean; data: InstallationDesign }>(`/designs/${id}`).then(r => r.data.data),

  create: (dto: CreateDesignDTO) =>
    api.post<{ success: boolean; data: InstallationDesign }>('/designs', dto).then(r => r.data.data),

  update: (id: string, dto: UpdateDesignDTO) =>
    api.patch<{ success: boolean; data: InstallationDesign }>(`/designs/${id}`, dto).then(r => r.data.data),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/designs/${id}`).then(r => r.data),

  recalc: (id: string) =>
    api.post<{ success: boolean; data: InstallationDesign }>(`/designs/${id}/recalc`).then(r => r.data.data),

  uploadFloorPlan: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('floorPlan', file);
    return api.post<{ success: boolean; data: InstallationDesign }>(
      `/designs/${id}/floor-plan`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ).then(r => r.data.data);
  },

  // ── Helper: get-or-create design for a plan ──
  async getOrCreateForPlan(planId: string, siteName: string): Promise<InstallationDesign> {
    const designs = await designsApi.list({ planId });
    if (designs.length > 0) {
      return designsApi.get(designs[0].id);
    }
    return designsApi.create({ planId, siteName });
  },

  async getOrCreateForEvent(eventId: string, siteName: string): Promise<InstallationDesign> {
    const designs = await designsApi.list({ eventId });
    if (designs.length > 0) {
      return designsApi.get(designs[0].id);
    }
    return designsApi.create({ eventId, siteName });
  },

  // ── Sensors ──
  sensors: {
    list: (designId: string) =>
      api.get<{ success: boolean; data: SensorPlacement[] }>(`/designs/${designId}/sensors`).then(r => r.data.data),

    create: (designId: string, dto: CreateSensorDTO) =>
      api.post<{ success: boolean; data: SensorPlacement }>(`/designs/${designId}/sensors`, dto).then(r => r.data.data),

    update: (designId: string, sensorId: string, dto: UpdateSensorDTO) =>
      api.patch<{ success: boolean; data: SensorPlacement }>(`/designs/${designId}/sensors/${sensorId}`, dto).then(r => r.data.data),

    delete: (designId: string, sensorId: string) =>
      api.delete<{ success: boolean }>(`/designs/${designId}/sensors/${sensorId}`).then(r => r.data),
  },

  // ── Zones ──
  zones: {
    list: (designId: string) =>
      api.get<{ success: boolean; data: CoverageZone[] }>(`/designs/${designId}/zones`).then(r => r.data.data),

    create: (designId: string, dto: CreateZoneDTO) =>
      api.post<{ success: boolean; data: CoverageZone }>(`/designs/${designId}/zones`, dto).then(r => r.data.data),

    update: (designId: string, zoneId: string, dto: UpdateZoneDTO) =>
      api.patch<{ success: boolean; data: CoverageZone }>(`/designs/${designId}/zones/${zoneId}`, dto).then(r => r.data.data),

    delete: (designId: string, zoneId: string) =>
      api.delete<{ success: boolean }>(`/designs/${designId}/zones/${zoneId}`).then(r => r.data),
  },
};
