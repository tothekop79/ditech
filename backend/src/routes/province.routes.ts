import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { regionId, regionCode } = req.query;
    const where: any = {};
    if (regionId) where.regionId = String(regionId);
    if (regionCode) where.region = { code: String(regionCode) };

    const provinces = await prisma.province.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        region: { select: { id: true, code: true, name: true, nameThai: true } },
      },
    });
    res.json({ success: true, data: provinces });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const province = await prisma.province.findUnique({
      where: { id: req.params.id },
      include: { region: true },
    });
    if (!province) {
      res.status(404).json({ success: false, message: 'Province not found' });
      return;
    }
    res.json({ success: true, data: province });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { code, name, nameThai, regionId } = req.body;
    if (!code || !name || !regionId) {
      res.status(400).json({ success: false, message: 'code, name, regionId required' });
      return;
    }
    const province = await prisma.province.create({
      data: { code, name, nameThai: nameThai || name, regionId },
    });
    res.json({ success: true, data: province });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, nameThai, regionId, isActive } = req.body;
    const province = await prisma.province.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(nameThai !== undefined ? { nameThai } : {}),
        ...(regionId !== undefined ? { regionId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });
    res.json({ success: true, data: province });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const planCount = await prisma.installationPlan.count({
      where: { provinceId: req.params.id },
    });
    if (planCount > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete: ${planCount} plan(s) still use this province. Reassign them first.`,
      });
      return;
    }
    await prisma.province.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
