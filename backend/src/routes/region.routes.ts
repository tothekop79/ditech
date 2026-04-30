import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ──────────────────────────────────────────────────────
// REGIONS
// ──────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const regions = await prisma.region.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { provinces: true, plans: true } },
      },
    });
    res.json({ success: true, data: regions });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const region = await prisma.region.findUnique({
      where: { id: req.params.id },
      include: {
        provinces: { orderBy: { name: 'asc' } },
        _count: { select: { plans: true } },
      },
    });
    if (!region) {
      res.status(404).json({ success: false, message: 'Region not found' });
      return;
    }
    res.json({ success: true, data: region });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { code, name, nameThai, sortOrder } = req.body;
    if (!code || !name) {
      res.status(400).json({ success: false, message: 'code and name required' });
      return;
    }
    const region = await prisma.region.create({
      data: { code, name, nameThai: nameThai || name, sortOrder: sortOrder || 99 },
    });
    res.json({ success: true, data: region });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, nameThai, sortOrder, isActive } = req.body;
    const region = await prisma.region.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(nameThai !== undefined ? { nameThai } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });
    res.json({ success: true, data: region });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    // Prevent deletion if any plans still reference this region
    const planCount = await prisma.installationPlan.count({
      where: { regionId: req.params.id },
    });
    if (planCount > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete: ${planCount} plan(s) still use this region. Reassign them first.`,
      });
      return;
    }
    await prisma.region.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
