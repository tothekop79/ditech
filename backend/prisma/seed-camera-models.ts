/**
 * Seed system Camera Models — Phase C1
 *
 * Run via: docker compose exec backend npx ts-node prisma/seed-camera-models.ts
 *
 * Idempotent: uses upsert by (brand, modelName, variant) unique key.
 */
import { PrismaClient } from '@prisma/client';
import {
  VIONVISION_G6_TABLE,
  VIONVISION_G5_TABLE,
  HIKVISION_CCTV_TABLE,
} from '../src/utils/cameraCoverage';

const prisma = new PrismaClient();

const SYSTEM_MODELS = [
  {
    brand: 'Vionvision',
    modelName: 'G6',
    variant: 'White',
    displayName: 'Vionvision G6 (White)',
    coverageTable: VIONVISION_G6_TABLE,
    minHeight: 2.6,
    maxHeight: 4.6,
    resolution: '3840×2160 @ 25fps',
    powerSupply: 'PoE 802.3af / DC 12V',
    notes: 'Premium AI sensor with embedded ceiling mount. Supports topview people counting, engagement zones, and heatmap.',
    supportedFunctions: ['entrance', 'engagement', 'heatmap', 'passerby'],
    iconColor: '#3b82f6',
    isSystem: true,
  },
  {
    brand: 'Vionvision',
    modelName: 'G6',
    variant: 'Black',
    displayName: 'Vionvision G6 (Black)',
    coverageTable: VIONVISION_G6_TABLE,
    minHeight: 2.6,
    maxHeight: 4.6,
    resolution: '3840×2160 @ 25fps',
    powerSupply: 'PoE 802.3af / DC 12V',
    notes: 'Black variant for dark-themed ceilings. Same coverage as White.',
    supportedFunctions: ['entrance', 'engagement', 'heatmap', 'passerby'],
    iconColor: '#1e293b',
    isSystem: true,
  },
  {
    brand: 'Vionvision',
    modelName: 'G5',
    variant: null,
    displayName: 'Vionvision G5',
    coverageTable: VIONVISION_G5_TABLE,
    minHeight: 2.5,
    maxHeight: 4.6,
    resolution: '2560×1440 @ 25fps',
    powerSupply: 'PoE 802.3af / DC 12V',
    notes: 'Standard AI sensor. Smaller coverage footprint than G6.',
    supportedFunctions: ['entrance', 'engagement', 'heatmap'],
    iconColor: '#a855f7',
    isSystem: true,
  },
  {
    brand: 'Hikvision',
    modelName: 'CCTV (Generic)',
    variant: null,
    displayName: 'Hikvision (CCTV)',
    coverageTable: HIKVISION_CCTV_TABLE,
    minHeight: 2.5,
    maxHeight: 6.0,
    resolution: 'varies by SKU',
    powerSupply: 'PoE / DC 12V',
    notes: 'Generic CCTV camera for monitoring (not for AI counting). Wider FOV, lower precision. Update with specific SKU spec when available.',
    supportedFunctions: ['cctv'],
    iconColor: '#10b981',
    isSystem: true,
  },
];

async function main() {
  console.log('🌱 Seeding system camera models...\n');

  for (const model of SYSTEM_MODELS) {
    const existing = await prisma.cameraModel.findUnique({
      where: {
        brand_modelName_variant: {
          brand: model.brand,
          modelName: model.modelName,
          variant: model.variant ?? '',
        },
      },
    }).catch(() => null);

    // Prisma's @@unique with nullable is tricky — try findFirst instead
    const found = existing ?? await prisma.cameraModel.findFirst({
      where: {
        brand: model.brand,
        modelName: model.modelName,
        variant: model.variant,
      },
    });

    if (found) {
      // Update in place (refresh tables/specs)
      await prisma.cameraModel.update({
        where: { id: found.id },
        data: {
          displayName: model.displayName,
          coverageTable: model.coverageTable as any,
          minHeight: model.minHeight,
          maxHeight: model.maxHeight,
          resolution: model.resolution,
          powerSupply: model.powerSupply,
          notes: model.notes,
          supportedFunctions: model.supportedFunctions,
          iconColor: model.iconColor,
          isSystem: true,
        },
      });
      console.log(`  ↻ Updated: ${model.displayName}`);
    } else {
      await prisma.cameraModel.create({
        data: {
          brand: model.brand,
          modelName: model.modelName,
          variant: model.variant,
          displayName: model.displayName,
          coverageTable: model.coverageTable as any,
          minHeight: model.minHeight,
          maxHeight: model.maxHeight,
          resolution: model.resolution,
          powerSupply: model.powerSupply,
          notes: model.notes,
          supportedFunctions: model.supportedFunctions,
          iconColor: model.iconColor,
          isSystem: true,
        },
      });
      console.log(`  ✓ Created: ${model.displayName}`);
    }
  }

  console.log('\n✅ Done.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
