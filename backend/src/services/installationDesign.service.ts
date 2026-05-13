import { PrismaClient, Prisma, UserRole } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import {
  interpolateCoverage,
  CoverageRow,
} from '../utils/cameraCoverage';
import { applyTiltProjection } from '../utils/tiltProjection';
import {
  sensorRectCorners,
  computeDesignStats,
  DesignSensor,
  DesignZone,
  Polygon,
  Point,
} from '../utils/coverageMath';

const prisma = new PrismaClient();

const UPLOAD_DIR = '/app/uploads/designs';
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════

const designInclude = {
  designer: { select: { id: true, fullName: true, email: true } },
  checkedBy: { select: { id: true, fullName: true, email: true } },
  plan: { select: { id: true, storeName: true, branchName: true } },
  event: { select: { id: true, name: true } },
  sensors: {
    include: {
      cameraModel: {
        select: { id: true, displayName: true, iconColor: true, imageUrl: true },
      },
    },
    orderBy: { sensorName: 'asc' as const },
  },
  zones: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { sensors: true, zones: true } },
} satisfies Prisma.InstallationDesignInclude;

/**
 * Compute coverage rectangle (width × depth in meters) from camera model + height.
 * Uses linear interpolation on the model's coverage table.
 */
async function computeCoverageForSensor(
  cameraModelId: string,
  mountingHeight: number,
  coverageMode?: string,
  tiltAngle?: number,
): Promise<{ width: number; depth: number; nearEdgeRatio?: number }> {
  const model = await prisma.cameraModel.findUnique({
    where: { id: cameraModelId },
    select: { coverageTable: true, minHeight: true, maxHeight: true },
  });
  if (!model) throw new Error('Camera model not found');

  const table = model.coverageTable as unknown as CoverageRow[];
  if (!Array.isArray(table) || table.length === 0) {
    throw new Error('Camera model has no coverage table');
  }

  const base = interpolateCoverage(mountingHeight, table);

  // Apply tilt projection — return trapezoid with width = far edge (max)
  // and nearEdgeRatio so the frontend can render the near edge as
  //   nearWidth = coverageWidth * nearEdgeRatio
  if (coverageMode === 'tilt_projection' && typeof tiltAngle === 'number') {
    const proj = applyTiltProjection(base.width, base.depth, tiltAngle);
    return {
      width: proj.farWidth,
      depth: proj.depth,
      nearEdgeRatio: proj.nearEdgeRatio,
    };
  }

  return base;
}

/**
 * Recalculate design coverage stats from current sensors and zones.
 * Updates the design row and returns the new stats.
 */
async function recalcDesignStats(designId: string) {
  const design = await prisma.installationDesign.findUnique({
    where: { id: designId },
    include: {
      sensors: true,
      zones: true,
    },
  });
  if (!design) throw new Error('Design not found');

  // Build sensor rectangles in floor-plan pixels
  const designSensors: DesignSensor[] = design.sensors.map((s) => ({
    functionType: s.functionType,
    rect: sensorRectCorners({
      x: s.x,
      y: s.y,
      rotation: s.rotation,
      coverageWidth: s.coverageWidth,
      coverageDepth: s.coverageDepth,
      anchorMode: (s.anchorMode || 'center') as any,
      scalePxPerMeter: design.scalePxPerMeter,
    }),
  }));

  const designZones: DesignZone[] = design.zones.map((z) => ({
    zoneType: z.zoneType,
    linePoints: z.linePoints
      ? (z.linePoints as unknown as [Point, Point])
      : undefined,
    polygon: z.polygon ? (z.polygon as unknown as Polygon) : undefined,
  }));

  // Walking area = full floor plan rectangle (if dimensions known)
  let walkingArea: Polygon | undefined;
  const explicitWalking = design.zones.find((z) => z.zoneType === 'walking_area');
  if (explicitWalking?.polygon) {
    walkingArea = explicitWalking.polygon as unknown as Polygon;
  } else if (design.floorPlanWidth && design.floorPlanHeight) {
    walkingArea = [
      { x: 0, y: 0 },
      { x: design.floorPlanWidth, y: 0 },
      { x: design.floorPlanWidth, y: design.floorPlanHeight },
      { x: 0, y: design.floorPlanHeight },
    ];
  }

  const stats = computeDesignStats(designSensors, designZones, walkingArea);

  return prisma.installationDesign.update({
    where: { id: designId },
    data: {
      entranceCoveragePercent: stats.entrancePercent,
      engagementCoveragePercent: stats.engagementPercent,
      heatmapCoveragePercent: stats.heatmapPercent,
      overallStatus: stats.overallStatus,
      recommendations: stats.recommendations as any,
    },
  });
}

/**
 * Auto-generate a design number unique per plan/event.
 * Format: "Design 01", "Design 02", ...
 */
async function nextDesignNumber(planId: string | null, eventId: string | null): Promise<string> {
  const where: Prisma.InstallationDesignWhereInput = {};
  if (planId) where.planId = planId;
  else if (eventId) where.eventId = eventId;
  else where.AND = [{ planId: null }, { eventId: null }];

  const count = await prisma.installationDesign.count({ where });
  return `Design ${String(count + 1).padStart(2, '0')}`;
}

// ════════════════════════════════════════════════
// Access control
// ════════════════════════════════════════════════

/**
 * Check whether a user can access a given design.
 * - ADMIN, PROJECT_MANAGER: all designs
 * - QA, CUSTOMER: read-only (caller enforces method-level)
 * - INSTALLER: only designs they created
 */
async function assertCanAccess(
  designId: string,
  userId: string,
  role: UserRole,
  mode: 'read' | 'write',
) {
  if (role === 'ADMIN' || role === 'PROJECT_MANAGER') return;

  const design = await prisma.installationDesign.findUnique({
    where: { id: designId },
    select: { designerId: true },
  });
  if (!design) throw new Error('Design not found');

  if (role === 'INSTALLER') {
    if (design.designerId !== userId) {
      throw new Error('Forbidden: you can only access your own designs');
    }
    return;
  }

  // QA, CUSTOMER: read-only
  if (mode === 'write') {
    throw new Error('Forbidden: read-only access for your role');
  }
}

// ════════════════════════════════════════════════
// Service
// ════════════════════════════════════════════════

export const installationDesignService = {
  // ── List designs (filtered by user role) ──
  async list(
    filters: { planId?: string; eventId?: string; designerId?: string; status?: string } = {},
    user: { userId: string; role: UserRole },
  ) {
    const where: Prisma.InstallationDesignWhereInput = {};
    if (filters.planId) where.planId = filters.planId;
    if (filters.eventId) where.eventId = filters.eventId;
    if (filters.designerId) where.designerId = filters.designerId;
    if (filters.status) where.overallStatus = filters.status;

    // INSTALLER: only own designs
    if (user.role === 'INSTALLER') {
      where.designerId = user.userId;
    }

    return prisma.installationDesign.findMany({
      where,
      include: {
        designer: { select: { id: true, fullName: true } },
        plan: { select: { id: true, storeName: true } },
        event: { select: { id: true, name: true } },
        _count: { select: { sensors: true, zones: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async get(id: string, user: { userId: string; role: UserRole }) {
    await assertCanAccess(id, user.userId, user.role, 'read');
    const design = await prisma.installationDesign.findUnique({
      where: { id },
      include: designInclude,
    });
    if (!design) throw new Error('Design not found');
    return design;
  },

  // ── Create new design ──
  async create(data: any, user: { userId: string; role: UserRole }) {
    if (user.role === 'QA' || user.role === 'CUSTOMER') {
      throw new Error('Forbidden: read-only role');
    }

    const designNumber = data.designNumber ?? await nextDesignNumber(
      data.planId ?? null,
      data.eventId ?? null,
    );

    return prisma.installationDesign.create({
      data: {
        planId: data.planId ?? null,
        eventId: data.eventId ?? null,
        siteName: data.siteName,
        storeType: data.storeType ?? null,
        designNumber,
        version: data.version ?? 'v1.0',
        ceilingHeight: data.ceilingHeight ?? 3.5,
        entranceHeight: data.entranceHeight ?? null,
        entranceWidth: data.entranceWidth ?? null,
        scalePxPerMeter: data.scalePxPerMeter ?? 20,
        installationNote: data.installationNote ?? null,
        designerId: user.userId,
      },
      include: designInclude,
    });
  },

  async update(id: string, data: any, user: { userId: string; role: UserRole }) {
    await assertCanAccess(id, user.userId, user.role, 'write');

    const updateData: Prisma.InstallationDesignUpdateInput = {};
    if ('siteName' in data) updateData.siteName = data.siteName;
    if ('storeType' in data) updateData.storeType = data.storeType;
    if ('version' in data) updateData.version = data.version;
    if ('ceilingHeight' in data) updateData.ceilingHeight = data.ceilingHeight;
    if ('entranceHeight' in data) updateData.entranceHeight = data.entranceHeight;
    if ('entranceWidth' in data) updateData.entranceWidth = data.entranceWidth;
    if ('scalePxPerMeter' in data) updateData.scalePxPerMeter = data.scalePxPerMeter;
    if ('installationNote' in data) updateData.installationNote = data.installationNote;

    // Plan/Event linkage (admins/PMs only)
    if (user.role === 'ADMIN' || user.role === 'PROJECT_MANAGER') {
      if ('planId' in data) updateData.plan = data.planId
        ? { connect: { id: data.planId } }
        : { disconnect: true };
      if ('eventId' in data) updateData.event = data.eventId
        ? { connect: { id: data.eventId } }
        : { disconnect: true };
      if ('checkedById' in data) updateData.checkedBy = data.checkedById
        ? { connect: { id: data.checkedById } }
        : { disconnect: true };
    }

    const updated = await prisma.installationDesign.update({
      where: { id },
      data: updateData,
      include: designInclude,
    });

    // Recalc if scale changed (affects all sensor coverage in px)
    if ('scalePxPerMeter' in data) {
      await recalcDesignStats(id);
      return prisma.installationDesign.findUnique({ where: { id }, include: designInclude });
    }

    return updated;
  },

  async delete(id: string, user: { userId: string; role: UserRole }) {
    await assertCanAccess(id, user.userId, user.role, 'write');

    // Delete floor plan file
    const design = await prisma.installationDesign.findUnique({
      where: { id },
      select: { floorPlanUrl: true },
    });
    if (design?.floorPlanUrl) {
      const filePath = path.join(UPLOAD_DIR, path.basename(design.floorPlanUrl));
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }

    return prisma.installationDesign.delete({ where: { id } });
  },

  // ── Floor plan upload ──
  async setFloorPlan(
    id: string,
    filename: string,
    width: number,
    height: number,
    user: { userId: string; role: UserRole },
  ) {
    await assertCanAccess(id, user.userId, user.role, 'write');

    const design = await prisma.installationDesign.findUnique({
      where: { id },
      select: { floorPlanUrl: true },
    });
    if (!design) throw new Error('Design not found');

    // Remove old floor plan
    if (design.floorPlanUrl) {
      const oldPath = path.join(UPLOAD_DIR, path.basename(design.floorPlanUrl));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
      }
    }

    return prisma.installationDesign.update({
      where: { id },
      data: {
        floorPlanUrl: `/uploads/designs/${filename}`,
        floorPlanWidth: width,
        floorPlanHeight: height,
      },
      include: designInclude,
    });
  },

  // ── Manual recalc ──
  async recalc(id: string, user: { userId: string; role: UserRole }) {
    await assertCanAccess(id, user.userId, user.role, 'read');
    await recalcDesignStats(id);
    return prisma.installationDesign.findUnique({
      where: { id },
      include: designInclude,
    });
  },

  // ════════════════════════════════════════
  // Sensor Placement sub-resource
  // ════════════════════════════════════════
  sensors: {
    async list(designId: string, user: { userId: string; role: UserRole }) {
      await assertCanAccess(designId, user.userId, user.role, 'read');
      return prisma.sensorPlacement.findMany({
        where: { designId },
        include: {
          cameraModel: { select: { id: true, displayName: true, iconColor: true, imageUrl: true } },
        },
        orderBy: { sensorName: 'asc' },
      });
    },

    async create(designId: string, data: any, user: { userId: string; role: UserRole }) {
      await assertCanAccess(designId, user.userId, user.role, 'write');

      // Auto-compute coverage if not provided or override is false
      let { coverageWidth, coverageDepth } = data;
      if (!data.coverageOverride || coverageWidth == null || coverageDepth == null) {
        const result = await computeCoverageForSensor(
          data.cameraModelId,
          data.mountingHeight ?? 3.5,
          data.coverageMode,
          data.tiltAngle,
        );
        coverageWidth = result.width;
        coverageDepth = result.depth;
        // Capture trapezoid ratio for tilt_projection mode
        if (result.nearEdgeRatio !== undefined) {
          data.nearEdgeRatio = result.nearEdgeRatio;
        }
      }

      const sensor = await prisma.sensorPlacement.create({
        data: {
          designId,
          cameraModelId: data.cameraModelId,
          sensorName: data.sensorName,
          functionType: data.functionType,
          mountingType: data.mountingType ?? 'embedded',
          x: data.x,
          y: data.y,
          rotation: data.rotation ?? 0,
          mountingHeight: data.mountingHeight ?? 3.5,
          tiltAngle: data.tiltAngle ?? 0,
          coverageWidth,
          coverageDepth,
          coverageOverride: data.coverageOverride ?? false,
          anchorMode: data.anchorMode ?? 'center',
          obstructionData: data.obstructionData ?? null,
          showAsImage: data.showAsImage ?? false,
          note: data.note ?? null,
          status: 'PASS',
          coverageMode: data.coverageMode ?? 'rectangle',
          nearEdgeRatio: data.nearEdgeRatio ?? 0.47,
          showLabels: data.showLabels ?? true,
          showDimensions: data.showDimensions ?? true,
          showDirectionArrow: data.showDirectionArrow ?? true,
        },
        include: {
          cameraModel: { select: { id: true, displayName: true, iconColor: true, imageUrl: true } },
        },
      });

      // Auto-recalc design stats
      await recalcDesignStats(designId);
      return sensor;
    },

    async update(designId: string, sensorId: string, data: any, user: { userId: string; role: UserRole }) {
      await assertCanAccess(designId, user.userId, user.role, 'write');

      const existing = await prisma.sensorPlacement.findFirst({
        where: { id: sensorId, designId },
      });
      if (!existing) throw new Error('Sensor not found in this design');

      const updateData: Prisma.SensorPlacementUpdateInput = {};
      if ('cameraModelId' in data) updateData.cameraModel = { connect: { id: data.cameraModelId } };
      if ('sensorName' in data) updateData.sensorName = data.sensorName;
      if ('functionType' in data) updateData.functionType = data.functionType;
      if ('mountingType' in data) updateData.mountingType = data.mountingType;
      if ('x' in data) updateData.x = data.x;
      if ('y' in data) updateData.y = data.y;
      if ('rotation' in data) updateData.rotation = data.rotation;
      if ('mountingHeight' in data) updateData.mountingHeight = data.mountingHeight;
      if ('tiltAngle' in data) updateData.tiltAngle = data.tiltAngle;
      if ('coverageOverride' in data) updateData.coverageOverride = data.coverageOverride;
      if ('coverageWidth' in data) updateData.coverageWidth = data.coverageWidth;
      if ('coverageDepth' in data) updateData.coverageDepth = data.coverageDepth;
      if ('anchorMode' in data) updateData.anchorMode = data.anchorMode;
      if ('obstructionData' in data) updateData.obstructionData = data.obstructionData;
      if ('showAsImage' in data) updateData.showAsImage = data.showAsImage;
      if ('note' in data) updateData.note = data.note;
      if ('status' in data) updateData.status = data.status;
      if ('coverageMode' in data) updateData.coverageMode = data.coverageMode;
      if ('showLabels' in data) updateData.showLabels = data.showLabels;
      if ('showDimensions' in data) updateData.showDimensions = data.showDimensions;
      if ('showDirectionArrow' in data) updateData.showDirectionArrow = data.showDirectionArrow;
      // C1.10c - newly whitelisted user fields
      if ('color' in data) updateData.color = data.color;
      // nearEdgeRatio is normally recomputed below; allow explicit override too
      if ('nearEdgeRatio' in data) updateData.nearEdgeRatio = data.nearEdgeRatio;

      // Re-interpolate coverage if model, height, tilt, or mode changed and override is false
      const willOverride = data.coverageOverride ?? existing.coverageOverride;
      const modelChanged = 'cameraModelId' in data && data.cameraModelId !== existing.cameraModelId;
      const heightChanged = 'mountingHeight' in data && data.mountingHeight !== existing.mountingHeight;
      const tiltChanged = 'tiltAngle' in data && data.tiltAngle !== existing.tiltAngle;
      const modeChanged = 'coverageMode' in data && data.coverageMode !== existing.coverageMode;
      if (!willOverride && (modelChanged || heightChanged || tiltChanged || modeChanged)) {
        const result = await computeCoverageForSensor(
          data.cameraModelId ?? existing.cameraModelId,
          data.mountingHeight ?? existing.mountingHeight,
          data.coverageMode ?? existing.coverageMode,
          data.tiltAngle ?? existing.tiltAngle,
        );
        updateData.coverageWidth = result.width;
        updateData.coverageDepth = result.depth;
        if (result.nearEdgeRatio !== undefined) {
          updateData.nearEdgeRatio = result.nearEdgeRatio;
        }
      }

      const sensor = await prisma.sensorPlacement.update({
        where: { id: sensorId },
        data: updateData,
        include: {
          cameraModel: { select: { id: true, displayName: true, iconColor: true, imageUrl: true } },
        },
      });

      await recalcDesignStats(designId);
      return sensor;
    },

    async delete(designId: string, sensorId: string, user: { userId: string; role: UserRole }) {
      await assertCanAccess(designId, user.userId, user.role, 'write');

      const existing = await prisma.sensorPlacement.findFirst({
        where: { id: sensorId, designId },
      });
      if (!existing) throw new Error('Sensor not found in this design');

      await prisma.sensorPlacement.delete({ where: { id: sensorId } });
      await recalcDesignStats(designId);
      return { success: true };
    },
  },

  // ════════════════════════════════════════
  // Coverage Zone sub-resource
  // ════════════════════════════════════════
  zones: {
    async list(designId: string, user: { userId: string; role: UserRole }) {
      await assertCanAccess(designId, user.userId, user.role, 'read');
      return prisma.coverageZone.findMany({
        where: { designId },
        orderBy: { createdAt: 'asc' },
      });
    },

    async create(designId: string, data: any, user: { userId: string; role: UserRole }) {
      await assertCanAccess(designId, user.userId, user.role, 'write');

      const zone = await prisma.coverageZone.create({
        data: {
          designId,
          zoneType: data.zoneType,
          name: data.name ?? null,
          linePoints: data.linePoints ?? null,
          polygon: data.polygon ?? null,
          metadata: data.metadata ?? null,
        },
      });

      await recalcDesignStats(designId);
      return zone;
    },

    async update(designId: string, zoneId: string, data: any, user: { userId: string; role: UserRole }) {
      await assertCanAccess(designId, user.userId, user.role, 'write');

      const existing = await prisma.coverageZone.findFirst({
        where: { id: zoneId, designId },
      });
      if (!existing) throw new Error('Zone not found in this design');

      const updateData: Prisma.CoverageZoneUpdateInput = {};
      if ('zoneType' in data) updateData.zoneType = data.zoneType;
      if ('name' in data) updateData.name = data.name;
      if ('linePoints' in data) updateData.linePoints = data.linePoints;
      if ('polygon' in data) updateData.polygon = data.polygon;
      if ('metadata' in data) updateData.metadata = data.metadata;

      const zone = await prisma.coverageZone.update({
        where: { id: zoneId },
        data: updateData,
      });

      await recalcDesignStats(designId);
      return zone;
    },

    async delete(designId: string, zoneId: string, user: { userId: string; role: UserRole }) {
      await assertCanAccess(designId, user.userId, user.role, 'write');

      const existing = await prisma.coverageZone.findFirst({
        where: { id: zoneId, designId },
      });
      if (!existing) throw new Error('Zone not found in this design');

      await prisma.coverageZone.delete({ where: { id: zoneId } });
      await recalcDesignStats(designId);
      return { success: true };
    },
  },
};
