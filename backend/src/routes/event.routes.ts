import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs/promises';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { eventService } from '../services/event.service';
import { rawdataFilesService } from '../services/rawdataFiles.service';
import { eventReportService } from '../services/eventReport.service';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();


const router = Router();
router.use(authenticate);

// Multer for Excel uploads — write to a temp dir, service moves to event dir
const upload = multer({
  dest: '/tmp/event-uploads',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xlsm)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .xlsx files are accepted'), ok);
  },
});
// Multer for source files (CaptureRecordsDetails-*.xlsx) — multi-file
const rawdataUpload = multer({
  dest: '/tmp/event-uploads-multi',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xlsm)$/i.test(file.originalname);
    cb(null, ok);
  },
});


// ──────────────────────────────────────────────────────────────
// Event CRUD
// ──────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const list = await eventService.list(req.query as any);
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/available-plans', async (req: Request, res: Response) => {
  try {
    const plans = await prisma.installationPlan.findMany({
      where: { eventId: null },
      select: {
        id: true, storeName: true, branchName: true, planStatus: true, scheduledDate: true,
        customer: { select: { customerName: true, customerCode: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: plans });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/linked-plans', async (req: Request, res: Response) => {
  try {
    const plans = await prisma.installationPlan.findMany({
      where: { eventId: req.params.id },
      select: {
        id: true, storeName: true, branchName: true, planStatus: true, readiness: true,
        scheduledDate: true, durationDays: true,
        customer: { select: { customerName: true, customerCode: true } },
      },
      orderBy: { scheduledDate: 'asc' },
    });
    res.json({ success: true, data: plans });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const event = await eventService.get(req.params.id);
    res.json({ success: true, data: event });
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message });
  }
});

router.post('/', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId ?? (req as any).user?.id ?? null;
    const event = await eventService.create(req.body, userId);
    res.status(201).json({ success: true, data: event });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/:id', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const event = await eventService.update(req.params.id, req.body);
    res.json({ success: true, data: event });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/:id/status', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const event = await eventService.setStatus(req.params.id, req.body.status);
    res.json({ success: true, data: event });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    await eventService.delete(req.params.id);
    await eventReportService.cleanupEventDir(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// Sub-collections (replace-all pattern)
// ──────────────────────────────────────────────────────────────

router.put('/:id/days', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const result = await eventService.setDays(req.params.id, req.body.days || []);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:id/gates', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const result = await eventService.setGates(req.params.id, req.body.gates || []);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:id/zones', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const result = await eventService.setZones(req.params.id, req.body.zones || []);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:id/activities', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const result = await eventService.setActivities(req.params.id, req.body.activities || []);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// Plans linkage (Event = parent of Plans)
// ──────────────────────────────────────────────────────────────

router.post('/:id/plans/:planId', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const result = await eventService.linkPlan(req.params.id, req.params.planId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/plans/:planId', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const result = await eventService.unlinkPlan(req.params.planId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// Rawdata upload
// ──────────────────────────────────────────────────────────────

router.post(
  '/:id/rawdata',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded (field name: file)' });
        return;
      }
      const result = await eventReportService.saveUploadedRawdata(req.params.id, req.file.path);

      // Mark event as DATA_COLLECTED if it was still in PLANNING
      try {
        const ev = await eventService.get(req.params.id);
        if (ev.status === 'PLANNING') {
          await eventService.setStatus(req.params.id, 'DATA_COLLECTED');
        }
      } catch { /* non-blocking */ }

      res.json({
        success: true,
        data: {
          filename: req.file.originalname,
          size: result.size,
          uploadedAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      // Clean tmp file if rename failed
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      res.status(400).json({ success: false, message: err.message });
    }
  },
);

// ═══════════════════════════════════════════════════════════════
// Multi-file rawdata source files (CaptureRecordsDetails-*.xlsx)
// ═══════════════════════════════════════════════════════════════

router.get('/:id/rawdata-files', async (req: Request, res: Response) => {
  try {
    const files = await rawdataFilesService.list(req.params.id);
    res.json({ success: true, data: files });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/:id/rawdata-files',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  rawdataUpload.array('files', 30),
  async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ success: false, message: 'No files uploaded' });
        return;
      }
      const saved = [];
      for (const f of files) {
        const entry = await rawdataFilesService.save(req.params.id, f.path, f.originalname);
        saved.push(entry);
      }
      res.json({ success: true, data: saved });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

router.delete('/:id/rawdata-files/:filename',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const ok = await rawdataFilesService.delete(req.params.id, req.params.filename);
      if (!ok) {
        res.status(404).json({ success: false, message: 'File not found' });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

router.post('/:id/rawdata-files/clear',
  authorize('ADMIN', 'PROJECT_MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const removed = await rawdataFilesService.clearAll(req.params.id);
      res.json({ success: true, data: { removed } });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);


router.get('/:id/rawdata/status', async (req: Request, res: Response) => {
  try {
    const has = await eventReportService.hasRawdata(req.params.id);
    res.json({ success: true, data: { uploaded: has } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// Report generation
// ──────────────────────────────────────────────────────────────

router.post('/:id/verify', async (req: Request, res: Response) => {
  try {
    const result = await eventReportService.verifyEvent(req.params.id);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/generate', authorize('ADMIN', 'PROJECT_MANAGER'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId ?? (req as any).user?.id ?? null;
    const report = await eventReportService.enqueueReport(req.params.id, userId);
    res.status(202).json({ success: true, data: report });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/:id/reports', async (req: Request, res: Response) => {
  try {
    const reports = await eventReportService.listReports(req.params.id);
    res.json({ success: true, data: reports });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const report = await eventReportService.getReport(req.params.reportId);
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── Serve the latest HTML dashboard ──
router.get('/reports/:reportId/dashboard.html', async (req: Request, res: Response) => {
  try {
    const filepath = await eventReportService.getReportDashboardPath(req.params.reportId, 'html');
    if (!filepath) {
      res.status(404).json({ success: false, message: 'Report or dashboard not found' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(filepath, (err: any) => {
      if (err) res.status(404).send('Dashboard file not on disk');
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/reports/:reportId/dashboard.xlsx', async (req: Request, res: Response) => {
  try {
    const filepath = await eventReportService.getReportDashboardPath(req.params.reportId, 'xlsx');
    if (!filepath) {
      res.status(404).json({ success: false, message: 'Report or dashboard not found' });
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="dashboard-${req.params.reportId}.xlsx"`);
    res.sendFile(filepath, (err: any) => {
      if (err) res.status(404).send('Dashboard file not on disk');
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/dashboard.html', async (req: Request, res: Response) => {
  try {
    const buf = await eventReportService.readHtml(req.params.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', buf.length.toString());
    res.send(buf);
  } catch (err: any) {
    res.status(404).send('<pre>Dashboard not generated yet.</pre>');
  }
});

// ── Download the Excel workbook ──
router.get('/:id/dashboard.xlsx', async (req: Request, res: Response) => {
  try {
    const buf = await eventReportService.readXlsx(req.params.id);
    const event = await eventService.get(req.params.id).catch(() => null);
    const name = (event?.name || 'event').replace(/[^a-zA-Z0-9-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}_dashboard.xlsx"`);
    res.setHeader('Content-Length', buf.length.toString());
    res.send(buf);
  } catch (err: any) {
    res.status(404).json({ success: false, message: 'Dashboard XLSX not available' });
  }
});

export default router;
