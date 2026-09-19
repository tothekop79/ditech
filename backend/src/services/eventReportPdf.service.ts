/**
 * eventReportPdf.service — Event Report v2, Step 4: the report as a PDF in Telegram.
 *
 * Renders the report's own Dashboard.html with Puppeteer and sends it as a document.
 * The engine is not touched: its `@page{size:A4 portrait;margin:10mm 10mm 12mm 10mm}` is what
 * decides the page box (preferCSSPageSize), because that bottom margin is the fix for the
 * footer overlap in lesson #61. No Puppeteer footerTemplate is used for the same reason.
 *
 * Sending is a side effect of an already-COMPLETED report: nothing in here may change the
 * report's status. Failures are recorded on the report row and surfaced in the UI instead.
 */
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { renderPdf } from './pdf.service';

const prisma = new PrismaClient();

export const PDF_FILENAME = 'Dashboard.pdf';

/**
 * Telegram's own document ceiling is 50 MB for bots; stop short of it so a send never fails
 * merely for being a few hundred KB over after multipart framing.
 */
export const TELEGRAM_FILE_LIMIT_BYTES = Number(process.env.TELEGRAM_MAX_FILE_BYTES) || 45 * 1024 * 1024;

export class ReportPdfError extends Error {}

/** MB with one decimal below 10, whole numbers above — so a 45 MB limit never prints as "0". */
const mb = (bytes: number): string => {
  const v = bytes / 1024 / 1024;
  return v >= 10 ? v.toFixed(0) : v.toFixed(1);
};

/**
 * Render (once) and return the path to this report's PDF.
 * Cached: an existing Dashboard.pdf next to the report's Dashboard.html is reused as is.
 */
export async function ensureReportPdf(reportId: string, opts: { force?: boolean } = {}): Promise<{
  pdfPath: string;
  bytes: number;
  rendered: boolean;
  renderMs: number;
}> {
  const { eventReportService } = await import('./eventReport.service');
  const htmlPath = await eventReportService.getReportDashboardPath(reportId, 'html');
  if (!htmlPath) throw new ReportPdfError(`Report ${reportId} has no Dashboard.html to render`);

  const pdfPath = path.join(path.dirname(htmlPath), PDF_FILENAME);

  if (!opts.force) {
    const cached = await fs.stat(pdfPath).catch(() => null);
    if (cached && cached.size > 0) {
      return { pdfPath, bytes: cached.size, rendered: false, renderMs: 0 };
    }
  }

  const startedAt = Date.now();
  const html = await fs.readFile(htmlPath, 'utf8');
  // `url` so anything the dashboard references relatively still resolves from its own folder
  const buf = await renderPdf(html, { preferCSSPageSize: true, url: `file://${htmlPath}` });

  const tmp = `${pdfPath}.partial`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, pdfPath);          // never leave a half-written PDF to be cached

  return { pdfPath, bytes: buf.length, rendered: true, renderMs: Date.now() - startedAt };
}

/** "ชื่องาน · ข้อมูลถึงวันที่ · profile · N/M วัน" */
export async function buildCaption(reportId: string): Promise<string> {
  const report = await prisma.eventReport.findUnique({
    where: { id: reportId },
    select: {
      id: true, profile: true, eventId: true,
      event: { select: { name: true, startDate: true, endDate: true } },
    },
  });
  if (!report?.event) throw new ReportPdfError(`Report ${reportId} not found`);

  const { rawdataFilesService } = await import('./rawdataFiles.service');
  const files = await rawdataFilesService.list(report.eventId);
  const dates = files.map((f) => f.date).filter((d): d is string => !!d).sort();

  const start = report.event.startDate.toISOString().slice(0, 10);
  const end = report.event.endDate.toISOString().slice(0, 10);
  const totalDays = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1);
  const latest = dates.length ? dates[dates.length - 1] : '—';

  return [
    `📊 ${report.event.name}`,
    `ข้อมูลถึงวันที่ ${latest}`,
    `profile ${report.profile}`,
    `${dates.length}/${totalDays} วัน`,
  ].join(' · ');
}

export interface SendPdfResult {
  sent: boolean;
  /** true when the PDF exists but was too big to attach, so a link went out instead */
  tooLarge: boolean;
  bytes: number;
  renderMs: number;
  rendered: boolean;
  error?: string;
}

/**
 * Render if needed and send the PDF to one chat.
 * Never throws for a send failure — the caller is finishing an already-COMPLETED report.
 */
export async function sendReportPdf(
  reportId: string,
  chatId: string,
  opts: { force?: boolean } = {},
): Promise<SendPdfResult> {
  const base: SendPdfResult = { sent: false, tooLarge: false, bytes: 0, renderMs: 0, rendered: false };
  try {
    const { pdfPath, bytes, rendered, renderMs } = await ensureReportPdf(reportId, opts);
    const caption = await buildCaption(reportId);
    const { telegramService } = await import('./telegram.service');

    if (bytes > TELEGRAM_FILE_LIMIT_BYTES) {
      // Too big to attach: say so with the real number and fall back to the link.
      const sizeMb = mb(bytes);
      const limitMb = mb(TELEGRAM_FILE_LIMIT_BYTES);
      const url = `${process.env.APP_URL || 'http://192.168.1.120:3000'}/events`;
      console.warn(`[reportPdf] ${reportId}: PDF is ${sizeMb} MB (limit ${limitMb} MB) — sending a link instead`);
      await telegramService.sendMessage(
        chatId,
        `${caption}\n\n📎 ไฟล์ PDF ใหญ่เกินส่งทาง Telegram (${sizeMb} MB · จำกัด ${limitMb} MB)\n🌐 [เปิดรายงาน](${url})`,
      );
      const msg = `PDF ${sizeMb} MB exceeds the ${limitMb} MB limit — link sent instead`;
      await recordOutcome(reportId, null, msg);
      return { ...base, tooLarge: true, bytes, rendered, renderMs, error: msg };
    }

    const buf = await fs.readFile(pdfPath);
    const filename = `${safeName(await eventNameFor(reportId))}-Dashboard.pdf`;
    await telegramService.sendDocument(chatId, buf, filename, caption);

    await recordOutcome(reportId, new Date(), null);
    return { sent: true, tooLarge: false, bytes, rendered, renderMs };
  } catch (err: any) {
    const msg = String(err?.message ?? err).slice(0, 1000);
    console.error(`[reportPdf] ${reportId}: ${msg}`);
    await recordOutcome(reportId, null, msg).catch(() => { /* bookkeeping must not mask the error */ });
    return { ...base, error: msg };
  }
}

async function eventNameFor(reportId: string): Promise<string> {
  const r = await prisma.eventReport.findUnique({
    where: { id: reportId },
    select: { event: { select: { name: true } } },
  });
  return r?.event?.name ?? 'report';
}

const safeName = (s: string) => s.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'report';

/** The report keeps its own status; only these two informational fields move. */
async function recordOutcome(reportId: string, sentAt: Date | null, error: string | null) {
  await prisma.eventReport.update({
    where: { id: reportId },
    data: { telegramFileSentAt: sentAt, telegramFileError: error },
  });
}

export const eventReportPdfService = {
  ensureReportPdf, buildCaption, sendReportPdf, PDF_FILENAME, TELEGRAM_FILE_LIMIT_BYTES,
};
