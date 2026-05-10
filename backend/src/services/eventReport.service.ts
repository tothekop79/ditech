import { normalizeRawdataFile, verifyRawdata } from './rawdataNormalizer.service';
import { rawdataFilesService } from './rawdataFiles.service';
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
  reportSnapshotDir(eventId: string, reportId: string): string {
    return path.join(this.eventDir(eventId), 'reports', reportId);
  },

  async copyReportSnapshot(eventId: string, reportId: string): Promise<{ htmlPath: string; xlsxPath: string; htmlSize: number; xlsxSize: number } | null> {
    const dir = this.eventDir(eventId);
    const srcHtml = path.join(dir, HTML_FILENAME);
    const srcXlsx = path.join(dir, XLSX_FILENAME);
    const [hStat, xStat] = await Promise.all([
      fs.stat(srcHtml).catch(() => null),
      fs.stat(srcXlsx).catch(() => null),
    ]);
    if (!hStat || !xStat) return null;

    const snapDir = this.reportSnapshotDir(eventId, reportId);
    await fs.mkdir(snapDir, { recursive: true });
    const dstHtml = path.join(snapDir, HTML_FILENAME);
    const dstXlsx = path.join(snapDir, XLSX_FILENAME);
    await fs.copyFile(srcHtml, dstHtml);
    await fs.copyFile(srcXlsx, dstXlsx);
    return {
      htmlPath: dstHtml,
      xlsxPath: dstXlsx,
      htmlSize: hStat.size,
      xlsxSize: xStat.size,
    };
  },
  async dispatchEventReportReady(eventId: string, reportId: string): Promise<void> {
    try {
      const rules = await prisma.notificationRule.findMany({
        where: { trigger: 'EVENT_REPORT_READY' as any, enabled: true },
      });
      if (rules.length === 0) return;

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, organizer: true, venue: true, startDate: true, endDate: true, profile: true },
      });
      const report = await prisma.eventReport.findUnique({
        where: { id: reportId },
        select: { id: true, profile: true, durationMs: true, htmlSize: true, xlsxSize: true },
      });
      if (!event || !report) return;

      const dashboardUrl = `${process.env.APP_URL || 'http://192.168.1.120:3000'}/events/${event.id}`;
      const durationSec = ((report.durationMs ?? 0) / 1000).toFixed(1);
      const dateRange = `${event.startDate.toISOString().slice(0, 10)} → ${event.endDate.toISOString().slice(0, 10)}`;

      // Build default message (can be overridden by rule.templateBody)
      const defaultMsg = `📊 *Event Report Ready*

🎪 *${event.name}*
${event.organizer ? `👤 ${event.organizer}\n` : ''}${event.venue ? `📍 ${event.venue}\n` : ''}📅 ${dateRange}
⚙️ Profile: \`${report.profile}\`
⏱ Duration: ${durationSec}s
📄 HTML: ${((report.htmlSize ?? 0) / 1024).toFixed(0)} KB
📊 XLSX: ${((report.xlsxSize ?? 0) / 1024).toFixed(0)} KB

🌐 [Open dashboard](${dashboardUrl})`;

      const { telegramService } = await import('./telegram.service');

      for (const rule of rules) {
        const text = rule.templateBody && rule.templateBody.trim()
          ? rule.templateBody
              .replace(/\{\{event\.name\}\}/g, event.name)
              .replace(/\{\{event\.organizer\}\}/g, event.organizer || '')
              .replace(/\{\{event\.venue\}\}/g, event.venue || '')
              .replace(/\{\{report\.profile\}\}/g, report.profile)
              .replace(/\{\{report\.durationSec\}\}/g, durationSec)
              .replace(/\{\{dashboardUrl\}\}/g, dashboardUrl)
          : defaultMsg;

        for (const recipient of rule.recipients) {
          let status: 'SENT' | 'FAILED' = 'SENT';
          let errorMsg: string | null = null;
          try {
            await telegramService.sendMessage(recipient, text);
          } catch (err: any) {
            status = 'FAILED';
            errorMsg = err.message;
            console.warn(`[notify] Telegram send to ${recipient} failed:`, err.message);
          }
          await prisma.notificationLog.create({
            data: {
              ruleId: rule.id,
              recipient,
              channel: 'TELEGRAM',
              subject: `Event report: ${event.name}`,
              body: text,
              status,
              errorMessage: errorMsg,
              sentAt: status === 'SENT' ? new Date() : null,
            },
          });
        }
      }
    } catch (err: any) {
      console.error('[dispatchEventReportReady] error:', err);
    }
  },


  async getReportDashboardPath(reportId: string, kind: 'html' | 'xlsx'): Promise<string | null> {
    const report = await prisma.eventReport.findUnique({ where: { id: reportId } });
    if (!report) return null;
    const stored = kind === 'html' ? report.htmlPath : report.xlsxPath;
    const filename = kind === 'html' ? HTML_FILENAME : XLSX_FILENAME;
    // Prefer per-report snapshot
    const snapPath = path.join(this.reportSnapshotDir(report.eventId, reportId), filename);
    if (await fs.stat(snapPath).catch(() => null)) return snapPath;
    // Fallback to stored full path (if absolute)
    if (stored && stored.startsWith('/')) {
      if (await fs.stat(stored).catch(() => null)) return stored;
    }
    // Fallback to event-level dashboard
    const fallback = path.join(this.eventDir(report.eventId), filename);
    if (await fs.stat(fallback).catch(() => null)) return fallback;
    return null;
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

    // Normalize headers + drop any user _config (we always rebuild from DB)
    let normalizeReport;
    try {
      normalizeReport = await normalizeRawdataFile(dest);
      console.log(`[rawdata] normalized: ${normalizeReport.rowCount} rows, sheets: ${normalizeReport.sheetsAfter.join(', ')}`);
      if (normalizeReport.headerChanges.length > 0) {
        for (const h of normalizeReport.headerChanges) {
          console.log(`[rawdata]   ${h.sheet}: ${h.before.join(',')} -> ${h.after.join(',')}`);
        }
      }
    } catch (err: any) {
      console.warn(`[rawdata] normalize warning: ${err.message}`);
    }

    const stat = await fs.stat(dest);
    return { path: dest, size: stat.size, normalize: normalizeReport };
  },

  // ── Check if rawdata file exists ──
  async hasRawdata(eventId: string): Promise<boolean> {
    // Source files OR a previously-merged Rawdata.xlsx counts as "has rawdata"
    if (await rawdataFilesService.hasFiles(eventId)) return true;
    const filepath = path.join(this.eventDir(eventId), RAWDATA_FILENAME);
    return !!(await fs.stat(filepath).catch(() => null));
  },

  // ── Build _config sheet inside the rawdata file ──
  // Engine reads: A=event info, B=dates, C=gates, D=zones, E=activities, F=parameters
  async writeConfigSheetIntoRawdata(eventId: string): Promise<void> {
    const filepath = path.join(this.eventDir(eventId), RAWDATA_FILENAME);
    if (!(await fs.stat(filepath).catch(() => null))) {
      throw new Error('Rawdata.xlsx not found');
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        days: { orderBy: { dayNumber: 'asc' } },
        gates: { orderBy: { sortOrder: 'asc' } },
        zones: { orderBy: { sortOrder: 'asc' } },
        activities: { orderBy: [{ date: 'asc' }, { startTime: 'asc' }] },
        customer: true,
      },
    });
    if (!event) throw new Error('Event not found');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filepath);

    // ALWAYS drop existing _config — UI is source of truth
    const existing = wb.getWorksheet('_config');
    if (existing) wb.removeWorksheet(existing.id);

    const cfg = wb.addWorksheet('_config');

    const monthsTh = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const fmtDate = (d: Date) => `${d.getDate()} ${monthsTh[d.getMonth()]} ${d.getFullYear()}`;

    const startD = new Date(event.startDate);
    const endD = new Date(event.endDate);
    const dateRange = `${fmtDate(startD)} - ${fmtDate(endD)}`;
    const profileLabel = (
      event.profile === 'SIMPLE' ? 'Simple - Entrance Only' :
      event.profile === 'STANDARD' ? 'Standard - Entrance + Zone' :
      'Full - Entrance + Zone + Activities'
    );

    cfg.addRow(['  EVENT ANALYTICS DASHBOARD - Configuration']);
    cfg.addRow([`  ${event.name}  ·  ${dateRange}  ·  ${event.days.length} day(s)  ·  Profile: ${profileLabel}`]);
    cfg.addRow(['  Auto-generated by DITECH Installation Planner']);
    cfg.addRow([]);

    cfg.addRow(['  A — EVENT INFORMATION']);
    cfg.addRow(['Key', 'Value']);
    cfg.addRow(['event_name', event.name]);
    cfg.addRow(['organizer', event.organizer || '']);
    cfg.addRow(['venue', event.venue || '']);
    cfg.addRow(['system_credit', event.systemCredit || 'AI People Counting']);
    cfg.addRow(['confidential', event.confidential ? 'True' : 'False']);
    cfg.addRow(['output_xlsx', 'Dashboard.xlsx']);
    cfg.addRow(['output_html', 'Dashboard.html']);
    cfg.addRow(['event_type', event.profile.toLowerCase()]);
    cfg.addRow(['venue_type', event.venueType || 'Booth']);
    cfg.addRow(['show_passerby', event.showPasserby ? 'True' : 'False']);
    cfg.addRow([]);

    cfg.addRow([`  B — EVENT DATES  (${event.days.length} days)`]);
    cfg.addRow(['date (YYYY-MM-DD)', 'label', 'color (hex)']);
    for (const d of event.days) {
      const ds = new Date(d.date).toISOString().slice(0, 10);
      cfg.addRow([ds, d.label, d.color || '#1F77B4']);
    }
    cfg.addRow([]);

    cfg.addRow(['  C — GATE CONFIGURATION']);
    cfg.addRow(['type', 'location_name']);
    for (const g of event.gates) {
      cfg.addRow([g.gateType === 'ENTRANCE' ? 'Entrance' : 'Passerby', g.name]);
    }
    if (event.gates.length === 0) cfg.addRow(['  (no gates configured)']);
    cfg.addRow([]);

    cfg.addRow(['  D — ZONE CONFIGURATION']);
    cfg.addRow(['order', 'zone_name', 'abbrev (optional)']);
    event.zones.forEach((z: any, i: number) => {
      cfg.addRow([i + 1, z.name, z.abbrev || '']);
    });
    if (event.zones.length === 0) cfg.addRow(['  (no zones configured)']);
    cfg.addRow([]);

    cfg.addRow(['  E — ACTIVITY SCHEDULE']);
    cfg.addRow(['date (YYYY-MM-DD)', 'start (HH:MM)', 'end (HH:MM)', 'activity_name']);
    for (const a of event.activities) {
      const ds = new Date(a.date).toISOString().slice(0, 10);
      cfg.addRow([ds, a.startTime, a.endTime, a.name]);
    }
    if (event.activities.length === 0) cfg.addRow(['  (no activities scheduled)']);
    cfg.addRow([]);

    cfg.addRow(['  F — ANALYTICS PARAMETERS']);
    cfg.addRow(['parameter', 'value', 'description']);
    cfg.addRow(['dwell_min_sec', event.dwellMinSec, 'Minimum dwell time']);
    cfg.addRow(['dwell_max_sec', event.dwellMaxSec, 'Maximum dwell time']);
    cfg.addRow(['engagement_threshold_sec', event.engagementThresholdSec, 'Engaged threshold']);
    cfg.addRow(['display_hours_start', event.displayHoursStart, 'Heatmap display start']);
    cfg.addRow(['display_hours_end', event.displayHoursEnd, 'Heatmap display end']);
    cfg.addRow(['event_profile', event.profile.toLowerCase(), 'simple / standard / full']);
    cfg.addRow([]);

    cfg.addRow(['  G — METADATA']);
    cfg.addRow([`Generated: ${new Date().toISOString()}`]);
    cfg.addRow([`Source: DITECH Installation Planner — Event ${event.id}`]);

    await wb.xlsx.writeFile(filepath);
  },
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
        throw new Error('No rawdata source files uploaded yet.');
      }
      // 1b. Merge source files (CaptureRecordsDetails-*.xlsx) into Rawdata.xlsx
      if (await rawdataFilesService.hasFiles(eventId)) {
        const mr = await rawdataFilesService.merge(eventId);
        console.log(`[eventReport] merged ${mr.sourceFiles} source file(s) -> ${mr.mergedSheets.length} sheet(s), ${mr.totalRows} rows`);
        if (mr.skipped.length > 0) {
          for (const s of mr.skipped) console.warn(`[eventReport]   skipped ${s.filename}: ${s.reason}`);
        }
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

      // 4b. Snapshot outputs to per-report dir so each run keeps its own copy
      const snapshot = await this.copyReportSnapshot(eventId, reportId);


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
          htmlPath: snapshot?.htmlPath ?? htmlPath,
          xlsxPath: snapshot?.xlsxPath ?? xlsxPath,
          htmlSize: snapshot?.htmlSize ?? htmlStat.size,
          xlsxSize: snapshot?.xlsxSize ?? xlsxStat.size,
          stdout: stdout.slice(-10_000),
          stderr: stderr.slice(-5_000),
        },
      });

      // 5b. Dispatch EVENT_REPORT_READY notification (best-effort)
      this.dispatchEventReportReady(eventId, reportId).catch((e) => console.warn('notify dispatch failed:', e));
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

  async verifyEvent(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        days: { orderBy: { dayNumber: 'asc' } },
        gates: { orderBy: { sortOrder: 'asc' } },
        zones: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!event) throw new Error('Event not found');
    const filepath = path.join(this.eventDir(eventId), RAWDATA_FILENAME);
    return verifyRawdata(filepath, {
      days: event.days,
      gates: event.gates.map((g: any) => ({ name: g.name, gateType: g.gateType })),
      zones: event.zones.map((z: any) => ({ name: z.name })),
      profile: event.profile,
    });
  },

};
