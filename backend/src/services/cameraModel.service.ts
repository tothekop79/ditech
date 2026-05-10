import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const UPLOAD_DIR = '/app/uploads/camera-models';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const cameraModelService = {
  // ── List with optional filters ──
  async list(filters: { brand?: string; isSystem?: boolean; isActive?: boolean } = {}) {
    const where: Prisma.CameraModelWhereInput = {};
    if (filters.brand) where.brand = filters.brand;
    if (typeof filters.isSystem === 'boolean') where.isSystem = filters.isSystem;
    if (typeof filters.isActive === 'boolean') where.isActive = filters.isActive;
    else where.isActive = true;  // default: only active

    return prisma.cameraModel.findMany({
      where,
      orderBy: [
        { isSystem: 'desc' },
        { brand: 'asc' },
        { modelName: 'asc' },
        { variant: 'asc' },
      ],
    });
  },

  async get(id: string) {
    const model = await prisma.cameraModel.findUnique({ where: { id } });
    if (!model) throw new Error('Camera model not found');
    return model;
  },

  async create(data: any) {
    return prisma.cameraModel.create({
      data: {
        brand: data.brand,
        modelName: data.modelName,
        variant: data.variant ?? null,
        displayName: data.displayName,
        coverageTable: data.coverageTable as any,
        minHeight: data.minHeight ?? 2.5,
        maxHeight: data.maxHeight ?? 4.6,
        resolution: data.resolution ?? null,
        powerSupply: data.powerSupply ?? null,
        notes: data.notes ?? null,
        supportedFunctions: data.supportedFunctions ?? ['entrance', 'engagement', 'heatmap'],
        iconColor: data.iconColor ?? null,
        isSystem: false,
        isActive: true,
      },
    });
  },

  async update(id: string, data: any) {
    // Prevent disabling system models or changing isSystem flag
    const existing = await this.get(id);
    if (existing.isSystem && 'isSystem' in data) {
      delete data.isSystem;
    }

    const updateData: Prisma.CameraModelUpdateInput = {};
    if ('brand' in data) updateData.brand = data.brand;
    if ('modelName' in data) updateData.modelName = data.modelName;
    if ('variant' in data) updateData.variant = data.variant;
    if ('displayName' in data) updateData.displayName = data.displayName;
    if ('coverageTable' in data) updateData.coverageTable = data.coverageTable;
    if ('minHeight' in data) updateData.minHeight = data.minHeight;
    if ('maxHeight' in data) updateData.maxHeight = data.maxHeight;
    if ('resolution' in data) updateData.resolution = data.resolution;
    if ('powerSupply' in data) updateData.powerSupply = data.powerSupply;
    if ('notes' in data) updateData.notes = data.notes;
    if ('supportedFunctions' in data) updateData.supportedFunctions = data.supportedFunctions;
    if ('iconColor' in data) updateData.iconColor = data.iconColor;
    if ('isActive' in data && !existing.isSystem) updateData.isActive = data.isActive;

    return prisma.cameraModel.update({
      where: { id },
      data: updateData,
    });
  },

  async delete(id: string) {
    const existing = await this.get(id);
    if (existing.isSystem) {
      throw new Error('Cannot delete system camera models');
    }

    // Check usage
    const sensorCount = await prisma.sensorPlacement.count({ where: { cameraModelId: id } });
    if (sensorCount > 0) {
      throw new Error(`Cannot delete: ${sensorCount} sensor(s) still using this model. Delete or reassign sensors first.`);
    }

    return prisma.cameraModel.delete({ where: { id } });
  },

  // ── Upload camera image ──
  async setImage(id: string, filename: string) {
    const model = await this.get(id);

    // Delete old image if exists
    if (model.imageUrl) {
      const oldPath = path.join(UPLOAD_DIR, path.basename(model.imageUrl));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
      }
    }

    const imageUrl = `/uploads/camera-models/${filename}`;
    return prisma.cameraModel.update({
      where: { id },
      data: { imageUrl },
    });
  },

  async clearImage(id: string) {
    const model = await this.get(id);
    if (model.imageUrl) {
      const oldPath = path.join(UPLOAD_DIR, path.basename(model.imageUrl));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
      }
    }
    return prisma.cameraModel.update({
      where: { id },
      data: { imageUrl: null },
    });
  },
};
