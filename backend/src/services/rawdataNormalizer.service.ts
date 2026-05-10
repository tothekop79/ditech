import ExcelJS from 'exceljs';
import { promises as fs } from 'fs';
import path from 'path';

// ──────────────────────────────────────────────────────────────────
// Engine column expectations (must match dashboard_engine.py COL_NAMES)
// ──────────────────────────────────────────────────────────────────
export const ENGINE_COLUMNS = [
  'No', 'unid', 'VideoId', 'BodyID', 'PersonnelNo',
  'CustomerType', 'AgeGroup', 'Gender', 'Event',
  'CameraID', 'Time', 'Location',
] as const;

// Fuzzy map of raw → canonical (handles 'No.', 'Video Id', 'Personnel No.', etc.)
const COLUMN_ALIASES: Record<string, string> = {
  'no': 'No', 'no.': 'No', 'number': 'No',
  'unid': 'unid', 'uid': 'unid',
  'videoid': 'VideoId', 'video id': 'VideoId', 'video_id': 'VideoId',
  'bodyid': 'BodyID', 'body id': 'BodyID', 'body_id': 'BodyID',
  'personnelno': 'PersonnelNo', 'personnel no.': 'PersonnelNo',
  'personnel no': 'PersonnelNo', 'personnel_no': 'PersonnelNo',
  'customertype': 'CustomerType', 'customer type': 'CustomerType', 'customer_type': 'CustomerType',
  'agegroup': 'AgeGroup', 'age group': 'AgeGroup', 'age_group': 'AgeGroup',
  'gender': 'Gender', 'sex': 'Gender',
  'event': 'Event',
  'cameraid': 'CameraID', 'camera id': 'CameraID', 'camera_id': 'CameraID',
  'time': 'Time', 'timestamp': 'Time', 'datetime': 'Time',
  'location': 'Location', 'place': 'Location', 'gate': 'Location',
};

function normalizeHeader(name: string): string {
  if (!name) return '';
  const key = String(name).trim().toLowerCase().replace(/\s+/g, ' ');
  return COLUMN_ALIASES[key] || COLUMN_ALIASES[key.replace(/\s/g, '')] || String(name).trim();
}

// ──────────────────────────────────────────────────────────────────
// Normalize uploaded Rawdata.xlsx
// Strategy:
//   1. Drop any '_config' sheet (we always rebuild from DB)
//   2. Detect data sheets:
//        - If ≥1 sheet matching `data_YYYY-MM-DD` → keep as-is
//        - Else if a single 'data' sheet → leave as-is (engine handles)
//        - Else if a non-_config sheet exists → rename to 'data'
//   3. For every data sheet, normalize header row to engine columns
//   4. Save in place
// ──────────────────────────────────────────────────────────────────
export async function normalizeRawdataFile(filepath: string): Promise<{
  sheetsBefore: string[];
  sheetsAfter: string[];
  headerChanges: { sheet: string; before: string[]; after: string[] }[];
  rowCount: number;
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filepath);

  const sheetsBefore = wb.worksheets.map((s) => s.name);
  const headerChanges: { sheet: string; before: string[]; after: string[] }[] = [];
  let rowCount = 0;

  // 1. Drop _config (we always rebuild)
  const cfg = wb.getWorksheet('_config');
  if (cfg) wb.removeWorksheet(cfg.id);

  // Identify data sheets
  const dataSheets = wb.worksheets.filter((ws) =>
    ws.name === 'data' || /^data_\d{4}-\d{2}-\d{2}$/.test(ws.name),
  );

  // If no data sheets but exactly one non-_config sheet remains → rename to 'data'
  if (dataSheets.length === 0 && wb.worksheets.length === 1) {
    wb.worksheets[0].name = 'data';
    dataSheets.push(wb.worksheets[0]);
  }

  // 2. Normalize headers in every data sheet
  for (const ws of dataSheets) {
    const headerRow = ws.getRow(1);
    const before: string[] = [];
    const after: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      const orig = String(cell.value ?? '');
      before.push(orig);
      const norm = normalizeHeader(orig);
      after.push(norm);
      cell.value = norm;
    });
    headerRow.commit();
    if (before.join('|') !== after.join('|')) {
      headerChanges.push({ sheet: ws.name, before, after });
    }
    // count rows (excluding header)
    rowCount += Math.max(0, ws.actualRowCount - 1);
  }

  await wb.xlsx.writeFile(filepath);

  return {
    sheetsBefore,
    sheetsAfter: wb.worksheets.map((s) => s.name),
    headerChanges,
    rowCount,
  };
}

// ──────────────────────────────────────────────────────────────────
// Verify rawdata against event config — returns checklist
// ──────────────────────────────────────────────────────────────────
export interface VerifyCheck {
  level: 'success' | 'warning' | 'error' | 'info';
  label: string;
  detail?: string;
  ok: boolean;
}

export async function verifyRawdata(
  filepath: string,
  event: {
    days: { date: Date | string; label: string }[];
    gates: { name: string; gateType: string }[];
    zones: { name: string }[];
    profile: string;
  },
): Promise<{ checks: VerifyCheck[]; canGenerate: boolean }> {
  const checks: VerifyCheck[] = [];

  // SOURCE FILES CHECK — count uploaded CaptureRecordsDetails files
  // (we do this via fs scan since we don't have access to rawdataFilesService here
  //  — would create a circular import; this duplicates a tiny bit of logic.)
  try {
    const eventDir = path.dirname(filepath);
    const sourceDir = path.join(eventDir, 'source');
    const sourceFiles = await fs.readdir(sourceDir).catch(() => [] as string[]);
    const xlsxFiles = sourceFiles.filter((n) => /\.(xlsx|xlsm)$/i.test(n));
    if (xlsxFiles.length > 0) {
      checks.push({
        level: 'success',
        label: `${xlsxFiles.length} source file(s) uploaded`,
        detail: xlsxFiles.slice(0, 5).join(', ') + (xlsxFiles.length > 5 ? ` (+${xlsxFiles.length - 5} more)` : ''),
        ok: true,
      });
    }
  } catch { /* ignore */ }

  // 1. File exists
  let stat;
  try {
    stat = await fs.stat(filepath);
    checks.push({
      level: 'success',
      label: 'Rawdata.xlsx uploaded',
      detail: `${(stat.size / 1024 / 1024).toFixed(2)} MB`,
      ok: true,
    });
  } catch {
    checks.push({ level: 'error', label: 'Rawdata.xlsx not found — please upload', ok: false });
    return { checks, canGenerate: false };
  }

  // 2. Days configured
  if (event.days.length === 0) {
    checks.push({ level: 'error', label: 'No days configured', detail: 'Add at least one day in Config tab', ok: false });
  } else {
    checks.push({
      level: 'success',
      label: `${event.days.length} day(s) configured`,
      detail: event.days.map((d) => (typeof d.date === 'string' ? d.date.slice(0, 10) : d.date.toISOString().slice(0, 10))).join(', '),
      ok: true,
    });
  }

  // 3. Gates configured
  if (event.gates.length === 0) {
    checks.push({ level: 'error', label: 'No gates configured', detail: 'Add at least one gate', ok: false });
  } else {
    const entranceCount = event.gates.filter((g) => g.gateType === 'ENTRANCE').length;
    const passerbyCount = event.gates.filter((g) => g.gateType === 'PASSERBY').length;
    checks.push({
      level: 'success',
      label: `${event.gates.length} gate(s) configured`,
      detail: `${entranceCount} entrance${passerbyCount ? `, ${passerbyCount} passerby` : ''}`,
      ok: true,
    });
  }

  // 4. Inspect Excel — sheet structure + record counts + locations
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filepath);

    const dataSheets = wb.worksheets.filter(
      (ws) => ws.name === 'data' || /^data_\d{4}-\d{2}-\d{2}$/.test(ws.name),
    );

    if (dataSheets.length === 0) {
      checks.push({
        level: 'error',
        label: 'No data sheets found',
        detail: 'Sheets must be named "data" or "data_YYYY-MM-DD"',
        ok: false,
      });
      return { checks, canGenerate: false };
    }

    let totalRecords = 0;
    const locations = new Set<string>();
    const cameras = new Set<string>();
    const datesInData = new Set<string>();

    for (const ws of dataSheets) {
      const headerRow = ws.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: false }, (cell) => {
        headers.push(normalizeHeader(String(cell.value ?? '')));
      });

      const locIdx = headers.indexOf('Location');
      const camIdx = headers.indexOf('CameraID');
      const timeIdx = headers.indexOf('Time');

      const sheetRows = Math.max(0, ws.actualRowCount - 1);
      totalRecords += sheetRows;

      // Sample data (first 200 rows for fingerprinting)
      const sampleLimit = Math.min(200, sheetRows + 1);
      for (let r = 2; r <= sampleLimit; r++) {
        const row = ws.getRow(r);
        if (locIdx >= 0) {
          const v = row.getCell(locIdx + 1).value;
          if (v) locations.add(String(v).trim());
        }
        if (camIdx >= 0) {
          const v = row.getCell(camIdx + 1).value;
          if (v) cameras.add(String(v).trim());
        }
        if (timeIdx >= 0) {
          const v = row.getCell(timeIdx + 1).value;
          if (v) {
            const ts = String(v).slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) datesInData.add(ts);
          }
        }
      }
    }

    // 5. Sheet structure
    checks.push({
      level: 'success',
      label: `${dataSheets.length} data sheet(s) found`,
      detail: dataSheets.map((s) => s.name).join(', '),
      ok: true,
    });

    // 6. Records found
    if (totalRecords === 0) {
      checks.push({ level: 'error', label: 'No data records found', ok: false });
    } else {
      checks.push({
        level: 'success',
        label: `${totalRecords.toLocaleString()} data records found`,
        ok: true,
      });
    }

    // 7. Date matching
    const configuredDates = new Set(
      event.days.map((d) =>
        typeof d.date === 'string' ? d.date.slice(0, 10) : d.date.toISOString().slice(0, 10),
      ),
    );
    const datesNotInConfig = [...datesInData].filter((d) => !configuredDates.has(d));
    const datesNotInData = [...configuredDates].filter((d) => !datesInData.has(d));

    if (datesNotInConfig.length === 0 && datesNotInData.length === 0) {
      checks.push({
        level: 'success',
        label: 'Dates match between data and config',
        detail: [...configuredDates].sort().join(', '),
        ok: true,
      });
    } else {
      if (datesNotInConfig.length > 0) {
        checks.push({
          level: 'warning',
          label: 'Dates in data not configured as days',
          detail: datesNotInConfig.join(', ') + ' — these will be ignored by engine',
          ok: true,
        });
      }
      if (datesNotInData.length > 0) {
        checks.push({
          level: 'warning',
          label: 'Configured days have no data',
          detail: datesNotInData.join(', ') + ' — dashboard will show empty days',
          ok: true,
        });
      }
    }

    // 8. Location matching
    if (locations.size > 0 && event.gates.length > 0) {
      const configuredGateNames = new Set(event.gates.map((g) => g.name.toLowerCase().trim()));
      const dataLocs = [...locations];
      const locsNotInConfig = dataLocs.filter((loc) => !configuredGateNames.has(loc.toLowerCase().trim()));

      if (locsNotInConfig.length === 0) {
        checks.push({
          level: 'success',
          label: 'Locations in data match configured gates',
          detail: dataLocs.join(', '),
          ok: true,
        });
      } else {
        checks.push({
          level: 'warning',
          label: 'Locations in data not configured as gates',
          detail: locsNotInConfig.join(', ') + ' — these records will be ignored',
          ok: true,
        });
      }
    } else if (locations.size > 0) {
      checks.push({
        level: 'info',
        label: `Locations found in data`,
        detail: [...locations].slice(0, 10).join(', '),
        ok: true,
      });
    }

    // 9. Camera count
    if (cameras.size > 0) {
      checks.push({
        level: 'info',
        label: `${cameras.size} camera(s) detected`,
        ok: true,
      });
    }

    // 10. Profile sanity
    const profile = event.profile.toLowerCase();
    if (profile === 'full' && event.zones.length === 0) {
      checks.push({
        level: 'warning',
        label: 'Profile is FULL but no zones configured',
        detail: 'Engine will skip zone analytics',
        ok: true,
      });
    } else if (profile === 'standard' && event.zones.length === 0) {
      checks.push({
        level: 'warning',
        label: 'Profile is STANDARD but no zones configured',
        detail: 'Consider switching to SIMPLE profile',
        ok: true,
      });
    }
  } catch (err: any) {
    checks.push({
      level: 'error',
      label: 'Failed to inspect Rawdata.xlsx',
      detail: err.message,
      ok: false,
    });
  }

  const hasErrors = checks.some((c) => c.level === 'error');
  return { checks, canGenerate: !hasErrors };
}
