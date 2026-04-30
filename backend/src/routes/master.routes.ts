import { Router } from 'express';
import { prisma } from '../config/db';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// ===================== CUSTOMERS =====================

// List (now returns ALL — active + inactive — frontend filters)
router.get('/customers', async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const data = await prisma.customer.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { customerCode: 'asc' },
      include: { _count: { select: { installationPlans: true } } },
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message || 'Failed' });
  }
});

router.post('/customers', async (req, res) => {
  try {
    const { customerCode, customerName, contactPerson, contactPhone, contactEmail, logoUrl } = req.body;
    if (!customerCode || !customerName) {
      return res.status(400).json({ success: false, message: 'customerCode and customerName are required' });
    }
    const data = await prisma.customer.create({
      data: {
        customerCode: String(customerCode).toUpperCase().trim(),
        customerName: String(customerName).trim(),
        contactPerson, contactPhone, contactEmail, logoUrl,
      },
    });
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Customer code already exists' });
    }
    res.status(400).json({ success: false, message: e.message || 'Failed' });
  }
});

router.patch('/customers/:id', async (req, res) => {
  try {
    const { customerCode, customerName, contactPerson, contactPhone, contactEmail, logoUrl, isActive } = req.body;
    const data = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...(customerCode !== undefined && { customerCode: String(customerCode).toUpperCase().trim() }),
        ...(customerName !== undefined && { customerName: String(customerName).trim() }),
        ...(contactPerson !== undefined && { contactPerson }),
        ...(contactPhone !== undefined && { contactPhone }),
        ...(contactEmail !== undefined && { contactEmail }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    res.json({ success: true, data });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Customer code already exists' });
    }
    res.status(400).json({ success: false, message: e.message || 'Failed' });
  }
});

router.delete('/customers/:id', async (req, res) => {
  try {
    const planCount = await prisma.installationPlan.count({ where: { customerId: req.params.id } });
    if (planCount > 0) {
      // Soft delete — mark inactive
      const data = await prisma.customer.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      return res.json({
        success: true,
        data,
        message: `Customer has ${planCount} plans — marked inactive instead of deleted`,
        softDeleted: true,
      });
    }
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Customer deleted' });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message || 'Failed' });
  }
});

// ===================== DEPARTMENTS =====================

router.get('/departments', async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const data = await prisma.department.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { departmentCode: 'asc' },
      include: { _count: { select: { installationPlans: true } } },
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message || 'Failed' });
  }
});

router.post('/departments', async (req, res) => {
  try {
    const { departmentCode, departmentName, departmentType } = req.body;
    if (!departmentCode || !departmentName) {
      return res.status(400).json({ success: false, message: 'departmentCode and departmentName are required' });
    }
    const data = await prisma.department.create({
      data: {
        departmentCode: String(departmentCode).toUpperCase().trim(),
        departmentName: String(departmentName).trim(),
        ...(departmentType && { departmentType }),
      },
    });
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Department code already exists' });
    }
    res.status(400).json({ success: false, message: e.message || 'Failed' });
  }
});

router.patch('/departments/:id', async (req, res) => {
  try {
    const { departmentCode, departmentName, departmentType, isActive } = req.body;
    const data = await prisma.department.update({
      where: { id: req.params.id },
      data: {
        ...(departmentCode !== undefined && { departmentCode: String(departmentCode).toUpperCase().trim() }),
        ...(departmentName !== undefined && { departmentName: String(departmentName).trim() }),
        ...(departmentType !== undefined && { departmentType }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    res.json({ success: true, data });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Department code already exists' });
    }
    res.status(400).json({ success: false, message: e.message || 'Failed' });
  }
});

router.delete('/departments/:id', async (req, res) => {
  try {
    const planCount = await prisma.installationPlan.count({ where: { departmentId: req.params.id } });
    if (planCount > 0) {
      const data = await prisma.department.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      return res.json({
        success: true,
        data,
        message: `Department has ${planCount} plans — marked inactive instead of deleted`,
        softDeleted: true,
      });
    }
    await prisma.department.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Department deleted' });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message || 'Failed' });
  }
});

// ===================== TEAMS (existing — keep for compat) =====================

router.get('/teams', async (req, res) => {
  try {
    const data = await prisma.team.findMany({
      where: { isActive: true },
      orderBy: { teamCode: 'asc' },
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message || 'Failed' });
  }
});

export default router;
