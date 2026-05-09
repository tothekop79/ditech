import { PrismaClient, EventReportStatus } from '@prisma/client';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

const prisma = new PrismaClient();

// ── Paths ──
const UPLOADS_ROOT = process.env.UPLOADS_ROOT || '/app/uploads';
const EVENTS_DIR = path.join(UPLOADS_ROOT, 'events');
const PYTHON_ENGINE = process.env.PYTHON_ENGINE_PATH || '/app/python-engine/dashboard_engine.py';
const PYTHON_CMD = process.env.PYTHON_CMD || 'python3';

// ── File names within event folder ──
const RAWDATA_FILENAME = 'Rawdata.xlsx';   // engine looks for this
const HTML_FILENAME = 'Dashboard.html';
const XLSX_FILENAME = 'Dashboard.xlsx';

export const eventReportService = {
  // ── Folder management ──
  eventDir(eventId: string) {
    return path.join(EVENTS_DIR, eventId);
  },

  async ensureEventDir(eventId: string) {
    const dir = this.eventDir(eventId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  },

  // ── Reports list / get ──
  async listReports(eventId: string) {
    return prisma.eventReport.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        triggeredBy: { select: { id: true, fullName: true } },
      },
    });
  },

  async getReport(reportId: string) {
    const r = await prisma.eventReport.findUnique({
      where: { id: reportId },
      include: {
        triggeredBy: { select: { id: true, fullName: true } },
        event: { select: { id: true, name: true } },
      },
    });
    if (!r) throw new Error('Report not found');
    return r;
  },

  // ── Save uploaded rawdata file (called from controller after multer) ──
  async saveUploadedRawdata(eventId: string, originalPath: string) {
    const dir = await this.ensureEventDir(eventId);
    const dest = path.join(dir, RAWDATA_FILENAME);
    // Cross-device-safe move: copy + unlink (multer's tmp dir may be on a
    // different filesystem than the uploads volume in Docker).
    await fs.copyFile(originalPath, dest);
    await fs.unlink(originalPath).catch(() => { /* best-effort cleanup */ });
    const stat = await fs.stat(dest);
    return { path: dest, size: stat.size };
  },

  // ── Check if rawdata file exists ──
  async hasRawdata(eventId: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.eventDir(eventId), RAWDATA_FILENAME));
      return true;
    } catch {
      return false;
    }
  },

  // ── Build _config sheet inside the rawdata file ──
  // Engine reads: A=event info, B=dates, C=gates, D=zones, E=activities, F=parameters
  async writeConfigSheetIntoRawdata(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        days: { orderBy: { dayNumber: 'asc' } },
        gates: { orderBy: { sortOrder: 'asc' } },
        zones: { orderBy: { sortOrder: 'asc' } },
        activities: { orderBy: [{ date: 'asc' }, { startTime: 'asc' }] },
      },
    });
    if (!event) throw new Error('Event not found');

    const rawdataPath = path.join(this.eventDir(eventId), RAWDATA_FILENAME);

    // Open workbook
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(rawdataPath);

    // PRESERVE user's _config if they wrote one in their Excel.
    // Engine reads _config first, so if it's already complete, we use theirs.
    const existing = wb.getWorksheet('_config');
    if (existing) {
      console.log(`[eventReport] _config sheet already present in Rawdata.xlsx — preserving user's config`);
      return; // skip regeneration entirely
    }

    const cfg = wb.addWorksheet('_config');

    let row = 1;
    const writeRow = (...vals: any[]) => {
      cfg.getRow(row).values = [undefined, ...vals];   // ExcelJS is 1-indexed; col A = idx 1
      row++;
    };
    const blank = () => { row++; };

    // ── Section A: Event info ──
    writeRow('A — Event Info');
    writeRow('Key', 'Value');
    writeRow('event_name', event.name);
    writeRow('organizer', event.organizer || '');
    writeRow('venue', event.venue || '');
    writeRow('venue_type', event.venueType || 'Booth');
    writeRow('system_credit', event.systemCredit);
    writeRow('confidential', event.confidential ? 'True' : 'False');
    writeRow('show_passerby', event.showPasserby ? 'True' : 'False');
    writeRow('event_type', (event.profile || 'FULL').toLowerCase());
    writeRow('output_xlsx', XLSX_FILENAME);
    writeRow('output_html', HTML_FILENAME);
    if (event.sponsorZones) writeRow('sponsor_zones', event.sponsorZones);
    blank();

    // ── Section B: Event dates ──
    writeRow('B — Event Dates');
    writeRow('Date', 'Label', 'Color');
    for (const d of event.days) {
      const iso = d.date.toISOString().slice(0, 10);
      writeRow(iso, d.label, d.color);
    }
    blank();

    // ── Section C: Gates ──
    writeRow('C — Gates');
    writeRow('Type', 'Name');
    for (const g of event.gates) {
      const type = g.gateType === 'PASSERBY' ? 'Passerby' : 'Entrance';
      writeRow(type, g.name);
    }
    blank();

    // ── Section D: Zones ──
    writeRow('D — Zones');
    writeRow('Order', 'Zone Name', 'Abbreviation');
    for (let i = 0; i < event.zones.length; i++) {
      const z = event.zones[i];
      writeRow(i + 1, z.name, z.abbrev || '');
    }
    blank();

    // ── Section E: Activities ──
    writeRow('E — Activities');
    writeRow('Date', 'Start', 'End', 'Name', 'Zone');
    for (const a of event.activities) {
      const iso = a.date.toISOString().slice(0, 10);
      writeRow(iso, a.startTime, a.endTime, a.name, a.zone || '');
    }
    blank();

    // ── Section F: Parameters ──
    writeRow('F — Parameters');
    writeRow('Parameter', 'Value');
    writeRow('dwell_min_sec', event.dwellMinSec);
    writeRow('dwell_max_sec', event.dwellMaxSec);
    writeRow('engagement_threshold_sec', event.engagementThresholdSec);
    writeRow('display_hours_start', event.displayHoursStart);
    writeRow('display_hours_end', event.displayHoursEnd);

    // Style: bold the section headers
    [1].forEach(() => {});
    cfg.eachRow((r) => {
      const v = r.getCell(1).value;
      if (typeof v === 'string' && /^[A-G] —/.test(v)) {
        r.getCell(1).font = { bold: true, size: 12 };
      }
    });

    cfg.getColumn(1).width = 22;
    cfg.getColumn(2).width = 28;
    cfg.getColumn(3).width = 20;

    await wb.xlsx.writeFile(rawdataPath);
  },

  // ── Create + run a report (synchronous wrapper; queue calls this) ──
  async runReport(reportId: string): Promise<void> {
    const report = await prisma.eventReport.findUnique({ where: { id: reportId } });
    if (!report) throw new Error('Report not found');

    const eventId = report.eventId;
    const startedAt = new Date();

    await prisma.eventReport.update({
      where: { id: reportId },
      data: { status: 'RUNNING', startedAt },
    });

    try {
      // 1. Verify rawdata exists
      if (!(await this.hasRawdata(eventId))) {
        throw new Error('Rawdata Excel file not uploaded yet.');
      }

      // 2. Write _config sheet from DB
      await this.writeConfigSheetIntoRawdata(eventId);

      // 3. Spawn Python engine
      //    Engine uses __file__ to locate Rawdata.xlsx, so we copy a fresh
      //    engine.py into the event directory before each run, then clean up.
      const dir = this.eventDir(eventId);
      const engineCopy = path.join(dir, 'dashboard_engine.py');
      await fs.copyFile(PYTHON_ENGINE, engineCopy);
      let stdout = '', stderr = '', exitCode = 1;
      try {
        const r = await this.spawnPython(dir, engineCopy);
        stdout = r.stdout; stderr = r.stderr; exitCode = r.exitCode;
      } finally {
        await fs.unlink(engineCopy).catch(() => {});
      }

      if (exitCode !== 0) {
        throw new Error(`Engine exited with code ${exitCode}. ${stderr.slice(-500)}`);
      }

      // 4. Verify outputs exist
      const htmlPath = path.join(dir, HTML_FILENAME);
      const xlsxPath = path.join(dir, XLSX_FILENAME);

      const [htmlStat, xlsxStat] = await Promise.all([
        fs.stat(htmlPath).catch(() => null),
        fs.stat(xlsxPath).catch(() => null),
      ]);

      if (!htmlStat || !xlsxStat) {
        throw new Error(`Engine completed but expected output files missing. stdout: ${stdout.slice(-300)}`);
      }

      // 5. Mark complete
      const completedAt = new Date();
      await prisma.eventReport.update({
        where: { id: reportId },
        data: {
          status: 'COMPLETED',
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          rawdataPath: RAWDATA_FILENAME,
          htmlPath: HTML_FILENAME,
          xlsxPath: XLSX_FILENAME,
          htmlSize: htmlStat.size,
          xlsxSize: xlsxStat.size,
          stdout: stdout.slice(-10_000),
          stderr: stderr.slice(-5_000),
        },
      });

      // 6. Bump event status
      await prisma.event.update({
        where: { id: eventId },
        data: { status: 'REPORT_READY' },
      });
    } catch (err: any) {
      console.error('[eventReport] failed:', err);
      await prisma.eventReport.update({
        where: { id: reportId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: err?.message || String(err),
          stderr: (err?.stack || '').slice(-5_000),
        },
      });
    }
  },

  // ── Spawn Python ──
  spawnPython(cwd: string, enginePath: string = PYTHON_ENGINE): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(PYTHON_CMD, [enginePath], {
        cwd,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Engine timeout (5 minutes)'));
      }, 5 * 60 * 1000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  },

  // ── Queue a new report (returns the queued record) ──
  async enqueueReport(eventId: string, triggeredById?: string | null) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new Error('Event not found');

    if (!(await this.hasRawdata(eventId))) {
      throw new Error('Please upload Rawdata.xlsx before generating a report.');
    }

    const report = await prisma.eventReport.create({
      data: {
        eventId,
        status: 'QUEUED',
        profile: (event.profile || 'FULL').toLowerCase(),
        triggeredById: triggeredById || null,
      },
    });

    // Try to enqueue via BullMQ; if not available, run inline
    try {
      const { eventReportQueue } = require('../queues/eventReport.queue');
      await eventReportQueue.add('run', { reportId: report.id }, { removeOnComplete: 100, removeOnFail: 50 });
    } catch (e) {
      // No queue available — run async (fire-and-forget) so request returns fast
      setImmediate(() => this.runReport(report.id).catch((err) => console.error(err)));
    }

    return report;
  },

  // ── Read output files ──
  async readHtml(eventId: string): Promise<Buffer> {
    return fs.readFile(path.join(this.eventDir(eventId), HTML_FILENAME));
  },

  async readXlsx(eventId: string): Promise<Buffer> {
    return fs.readFile(path.join(this.eventDir(eventId), XLSX_FILENAME));
  },

  // ── Delete event folder (called when event deleted) ──
  async cleanupEventDir(eventId: string) {
    try {
      await fs.rm(this.eventDir(eventId), { recursive: true, force: true });
    } catch (err) {
      console.error('[eventReport] cleanup error:', err);
    }
  },
};
