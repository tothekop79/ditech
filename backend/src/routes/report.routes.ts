import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { reportService } from '../services/report.service';
import { buildReportWorkbook } from '../services/excelExport.service';
import { generateReportPdf } from '../services/pdfExport.service';

const router = Router();
router.use(authenticate);

// ──────────────────────────────────────────────────────────────
// NEW: Dashboard endpoint with flexible filters
// GET /api/reports/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&region=BANGKOK&customerId=xxx
// ──────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const opts: any = {};
    if (req.query.from) opts.from = new Date(req.query.from as string);
    if (req.query.to) {
      const t = new Date(req.query.to as string);
      t.setHours(23, 59, 59, 999);
      opts.to = t;
    }
    if (req.query.region) opts.region = req.query.region as string;
    if (req.query.customerId) opts.customerId = req.query.customerId as string;

    const data = await reportService.getDashboard(opts);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
  }
});

// ── Existing endpoints (kept for backward compat) ──
router.get('/weekly', async (req, res) => {
  try {
    const weekStart = new Date(req.query.weekStart as string || new Date());
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const data = await reportService.getWeeklySummary(weekStart);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
  }
});

router.get('/monthly', async (req, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
    const data = await reportService.getMonthlySummary(year, month);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : 'Failed' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const format = (req.query.format as string) || 'xlsx';
    const period = (req.query.period as string) || 'weekly';

    let report;
    if (period === 'weekly') {
      const ws = new Date(req.query.weekStart as string || new Date());
      ws.setDate(ws.getDate() - ws.getDay());
      report = await reportService.getWeeklySummary(ws);
    } else {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
      report = await reportService.getMonthlySummary(year, month);
    }

    const filename = `DITECH_${period}_${new Date().toISOString().split('T')[0]}`;

    if (format === 'xlsx') {
      const buffer = buildReportWorkbook(report);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
      res.send(buffer);
    } else if (format === 'pdf') {
      const buffer = await generateReportPdf(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.pdf`);
      res.send(buffer);
    } else {
      res.status(400).json({ success: false, message: 'Format must be xlsx or pdf' });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e instanceof Error ? e.message : 'Export failed' });
  }
});

export default router;
