import { Router } from 'express';
import { InstallationPlanController } from '../controllers/installationPlan.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import { createPlanSchema, updatePlanSchema, rescheduleSchema, bulkImportSchema } from '../middlewares/installationPlan.validation';
import * as ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
const router = Router();
const ctrl = new InstallationPlanController();

router.use(authenticate);
router.get('/', (req, res) => ctrl.getAll(req, res));
router.get('/statistics', (req, res) => ctrl.statistics(req, res));
const _xprisma = new PrismaClient();

router.get('/export.xlsx', async (req: any, res: any) => {
  try {
    const plans = await _xprisma.installationPlan.findMany({
      include: {
        customer: { select: { customerCode: true, customerName: true } },
        department: { select: { departmentCode: true, departmentName: true } },
        team: { select: { name: true } },
      },
      orderBy: { scheduledDate: 'asc' },
    });
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DITECH Installation Planner';
    wb.created = new Date();
    const ws = wb.addWorksheet('Plans');
    ws.columns = [
      { header: 'Customer code',  key: 'customer',      width: 14 },
      { header: 'Department',     key: 'department',    width: 18 },
      { header: 'Branch',         key: 'branchName',    width: 24 },
      { header: 'Store name',     key: 'storeName',     width: 28 },
      { header: 'Region',         key: 'storeRegion',   width: 12 },
      { header: 'Province',       key: 'province',      width: 18 },
      { header: 'Sensors',        key: 'sensorCount',   width: 10 },
      { header: 'Scheduled date', key: 'scheduledDate', width: 14 },
      { header: 'Team',           key: 'teamName',      width: 14 },
      { header: 'Plan status',    key: 'planStatus',    width: 14 },
      { header: 'Site readiness', key: 'readiness',     width: 14 },
      { header: 'Contact name',   key: 'contactPerson', width: 18 },
      { header: 'Contact phone',  key: 'contactPhone',  width: 14 },
      { header: 'Description',    key: 'description',   width: 36 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

    plans.forEach((p: any) => {
      ws.addRow({
        customer: p.customer?.customerCode || '',
        department: p.department?.departmentCode || '',
        branchName: p.branchName || '',
        storeName: p.storeName,
        storeRegion: p.storeRegion,
        province: p.province || '',
        sensorCount: p.sensorCount,
        scheduledDate: p.scheduledDate ? new Date(p.scheduledDate).toISOString().slice(0, 10) : '',
        teamName: p.team?.name || '',
        planStatus: p.planStatus,
        readiness: p.readiness,
        contactPerson: p.contactPerson || '',
        contactPhone: p.contactPhone || '',
        description: p.description || '',
      });
    });
    const buffer = await wb.xlsx.writeBuffer();
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ditech-plans-${today}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/template.xlsx', async (_req: any, res: any) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Plans');
  ws.columns = [
    { header: 'customerCode',   key: 'customerCode',  width: 14 },
    { header: 'departmentCode', key: 'departmentCode',width: 16 },
    { header: 'branchName',     key: 'branchName',    width: 24 },
    { header: 'storeName',      key: 'storeName',     width: 28 },
    { header: 'storeRegion',    key: 'storeRegion',   width: 12 },
    { header: 'province',       key: 'province',      width: 18 },
    { header: 'sensorCount',    key: 'sensorCount',   width: 10 },
    { header: 'scheduledDate',  key: 'scheduledDate', width: 14 },
    { header: 'planStatus',     key: 'planStatus',    width: 14 },
    { header: 'readiness',      key: 'readiness',     width: 14 },
    { header: 'contactPerson',  key: 'contactPerson', width: 18 },
    { header: 'contactPhone',   key: 'contactPhone',  width: 14 },
    { header: 'description',    key: 'description',   width: 36 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  ws.addRow({ customerCode: 'XIAOMI', departmentCode: 'CENTRAL', branchName: 'Bangna',
    storeName: 'Central Bangna', storeRegion: 'BANGKOK', province: 'Bangkok',
    sensorCount: 2, scheduledDate: '2026-05-01', planStatus: 'DRAFT', readiness: 'PENDING',
    contactPerson: '', contactPhone: '', description: '' });
  ws.addRow({ customerCode: 'XIAOMI', departmentCode: 'BIG_C', branchName: 'Lopburi',
    storeName: 'BIG C Lopburi', storeRegion: 'UPC', province: 'Lopburi',
    sensorCount: 2, scheduledDate: '2026-05-08', planStatus: 'DRAFT', readiness: 'READY',
    contactPerson: '', contactPhone: '', description: '' });
  ws.addRow({ customerCode: 'XIAOMI', departmentCode: 'FASHION_ISLAND', branchName: '',
    storeName: 'Fashion Island', storeRegion: 'BANGKOK', province: 'Bangkok',
    sensorCount: 3, scheduledDate: '2026-05-05', planStatus: 'DRAFT', readiness: 'READY',
    contactPerson: '', contactPhone: '', description: '' });
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="ditech-plans-template.xlsx"');
  res.send(Buffer.from(buffer));
});

router.get('/:id', (req, res) => ctrl.getById(req, res));
router.post('/', authorize('ADMIN', 'PROJECT_MANAGER'), validate(createPlanSchema), (req, res) => ctrl.create(req, res));
router.put('/:id', authorize('ADMIN', 'PROJECT_MANAGER', 'INSTALLER'), validate(updatePlanSchema), (req, res) => ctrl.update(req, res));
router.patch('/:id/reschedule', authorize('ADMIN', 'PROJECT_MANAGER'), validate(rescheduleSchema), (req, res) => ctrl.reschedule(req, res));
router.delete('/:id', authorize('ADMIN'), (req, res) => ctrl.delete(req, res));
router.post('/:id/link-event', authorize('ADMIN', 'PROJECT_MANAGER'), (req, res) => ctrl.linkEvent(req, res));
router.post('/:id/unlink-event', authorize('ADMIN', 'PROJECT_MANAGER'), (req, res) => ctrl.unlinkEvent(req, res));

router.post('/bulk-import/validate', authorize('ADMIN', 'PROJECT_MANAGER'), validate(bulkImportSchema), (req, res) => ctrl.validateImport(req, res));
router.post('/bulk-import', authorize('ADMIN', 'PROJECT_MANAGER'), validate(bulkImportSchema), (req, res) => ctrl.bulkImport(req, res));



export default router;
