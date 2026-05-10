import ExcelJS from 'exceljs';
import { promises as fs } from 'fs';
import path from 'path';
import { normalizeRawdataFile } from './rawdataNormalizer.service';

const RAWDATA_FILENAME = 'Rawdata.xlsx';
const SOURCE_DIRNAME = 'source';

const UPLOADS_ROOT = process.env.EVENT_UPLOADS_ROOT || '/app/uploads/events';

function eventDir(eventId: string) { return path.join(UPLOADS_ROOT, eventId); }
function sourceDir(eventId: string) { return path.join(eventDir(eventId), SOURCE_DIRNAME); }

async function ensureSourceDir(eventId: string): Promise<string> {
  const dir = sourceDir(eventId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ──────────────────────────────────────────────────────────────────
// Extract YYYY-MM-DD from filename
//   "CaptureRecordsDetails-Alston-20260507.xlsx"  → "2026-05-07"
//   "Alston_2026-05-07.xlsx"                       → "2026-05-07"
//   "data 2026-05-07 export.xlsx"                  → "2026-05-07"
// Returns null if no date found.
// ──────────────────────────────────────────────────────────────────
export function extractDateFromFilename(filename: string): string | null {
  const base = path.basename(filename, path.extname(filename));

  // Try YYYY-MM-DD with dashes
  const dashed = base.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;

  // Try YYYYMMDD (8 consecutive digits)
  const compact = base.match(/(?<![\d])(\d{8})(?![\d])/);
  if (compact) {
    const s = compact[1];
    const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8);
    // Sanity check: month 01-12, day 01-31
    if (parseInt(m) >= 1 && parseInt(m) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────
export interface SourceFileEntry {
  filename: string;
  size: number;
  uploadedAt: string;
  date: string | null;        // extracted YYYY-MM-DD
  rowCount?: number;          // computed on demand (best-effort)
}

export const rawdataFilesService = {
  // ── List files in source/ ──
  async list(eventId: string): Promise<SourceFileEntry[]> {
    const dir = await ensureSourceDir(eventId);
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }

    const out: SourceFileEntry[] = [];
    for (const name of names) {
      if (!/\.(xlsx|xlsm)$/i.test(name)) continue;
      const full = path.join(dir, name);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      const entry: SourceFileEntry = {
        filename: name,
        size: stat.size,
        uploadedAt: stat.mtime.toISOString(),
        date: extractDateFromFilename(name),
      };
      out.push(entry);
    }
    // Sort by extracted date if available, else by name
    out.sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      return a.filename.localeCompare(b.filename);
    });
    return out;
  },

  // ── Save uploaded source file ──
  // Cross-device-safe (copy + unlink) like the main rawdata uploader.
  async save(eventId: string, originalPath: string, originalName: string): Promise<SourceFileEntry> {
    const dir = await ensureSourceDir(eventId);
    // Sanitize filename (keep extension + safe chars)
    const safe = originalName.replace(/[^\w.\-]+/g, '_');
    const dest = path.join(dir, safe);

    await fs.copyFile(originalPath, dest);
    await fs.unlink(originalPath).catch(() => { /* best-effort */ });

    const stat = await fs.stat(dest);
    return {
      filename: safe,
      size: stat.size,
      uploadedAt: stat.mtime.toISOString(),
      date: extractDateFromFilename(safe),
    };
  },

  // ── Delete a source file ──
  async delete(eventId: string, filename: string): Promise<boolean> {
    const dir = await ensureSourceDir(eventId);
    const target = path.join(dir, filename);
    if (!target.startsWith(dir)) throw new Error('Invalid filename');
    try {
      await fs.unlink(target);
      return true;
    } catch {
      return false;
    }
  },

  // ── Delete ALL source files (used when user replaces with new set) ──
  async clearAll(eventId: string): Promise<number> {
    const dir = await ensureSourceDir(eventId);
    let removed = 0;
    try {
      const names = await fs.readdir(dir);
      for (const name of names) {
        if (/\.(xlsx|xlsm)$/i.test(name)) {
          await fs.unlink(path.join(dir, name)).catch(() => {});
          removed++;
        }
      }
    } catch {/* ignore */}
    return removed;
  },

  // ── Merge all source files into a single Rawdata.xlsx ──
  // Each source file → one sheet named data_YYYY-MM-DD.
  // Headers are normalized to engine canonical names.
  async merge(eventId: string): Promise<{
    sourceFiles: number;
    mergedSheets: string[];
    totalRows: number;
    skipped: { filename: string; reason: string }[];
  }> {
    const files = await this.list(eventId);
    if (files.length === 0) {
      throw new Error('No source files uploaded — please upload at least one CaptureRecordsDetails file.');
    }

    const dir = sourceDir(eventId);
    const wb = new ExcelJS.Workbook();
    const mergedSheets: string[] = [];
    const skipped: { filename: string; reason: string }[] = [];
    let totalRows = 0;

    for (const f of files) {
      const date = f.date;
      if (!date) {
        skipped.push({ filename: f.filename, reason: 'No date in filename (expected YYYYMMDD or YYYY-MM-DD)' });
        continue;
      }

      const srcPath = path.join(dir, f.filename);
      const srcWb = new ExcelJS.Workbook();
      await srcWb.xlsx.readFile(srcPath);

      // Pick the data sheet: skip _config; prefer 'data' or first remaining
      const candidates = srcWb.worksheets.filter((ws) => ws.name !== '_config' && ws.name.toLowerCase() !== 'config');
      if (candidates.length === 0) {
        skipped.push({ filename: f.filename, reason: 'No data sheet found' });
        continue;
      }
      const srcSheet = candidates.find((s) => s.name === 'data')
        || candidates.find((s) => s.name.toLowerCase().startsWith('data'))
        || candidates[0];

      // Create destination sheet
      const targetName = `data_${date}`;
      // Avoid duplicate sheet names if multiple files map to same date
      let destName = targetName;
      let dup = 2;
      while (wb.worksheets.find((s) => s.name === destName)) {
        destName = `${targetName}_${dup++}`;
      }
      const destSheet = wb.addWorksheet(destName);

      // Copy all rows verbatim (header in row 1, data in row 2+)
      let rowsCopied = 0;
      srcSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        // row.values is 1-indexed; slice from 1
        const vals = (row.values as any[]).slice(1);
        destSheet.addRow(vals);
        if (rowNumber > 1) rowsCopied++;
      });

      mergedSheets.push(destName);
      totalRows += rowsCopied;
    }

    if (mergedSheets.length === 0) {
      throw new Error(`No usable source files. Skipped: ${skipped.map((s) => `${s.filename} (${s.reason})`).join('; ')}`);
    }

    const destPath = path.join(eventDir(eventId), RAWDATA_FILENAME);
    await wb.xlsx.writeFile(destPath);

    // Run normalizer on the merged file (header rename pass)
    try {
      await normalizeRawdataFile(destPath);
    } catch (err: any) {
      console.warn(`[rawdata-merge] normalize warning: ${err.message}`);
    }

    return { sourceFiles: files.length, mergedSheets, totalRows, skipped };
  },

  // ── Has any source file? (used by "ready to generate" check) ──
  async hasFiles(eventId: string): Promise<boolean> {
    const files = await this.list(eventId);
    return files.length > 0;
  },
};
