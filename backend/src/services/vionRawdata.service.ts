/**
 * vionRawdata.service — Event Report v2 data source.
 *
 * Pulls /api/v2/captureRecord straight from the vendor and writes a
 * `source/CaptureRecordsDetails-YYYY-MM-DD.xlsx` that is byte-compatible with the file a
 * user exports by hand from the Vion web UI, so the existing pipeline
 * (merge → _config → engine → snapshot → Telegram) runs on it unchanged.
 *
 * NOTHING in the UPLOAD path calls into this file. v2 is additive.
 *
 * ── Verified against real manual exports (Step 0, 2026-09-18) ────────────────
 * Two independent row-level joins on `unid`, 100% matched, zero field mismatches, on two
 * different Retail booth sites (2026-09-18 / 25,212 rows and 2026-09-15 / 16,326 rows).
 *
 * Facts that this file depends on — re-verify before changing any of them:
 *  - `counttimeLocal` is ALREADY site-local. Converting it from GMT+8 shifts every
 *    timestamp by an hour. Only `modifyTime` is GMT+8, and captureRecord never returns it.
 *  - `gateUnid` is a *location* id: it resolves against gateInfo OR zoneInfo.
 *    Zones with `zoneStatus !== 1` are superseded renames and must be ignored.
 *  - `pageSize` is capped at 1000 server-side; ask for more and you still get 1000.
 *  - Rows arrive strictly ASCENDING by `counttimeLocal` across pages. The manual
 *    export is DESCENDING, so we sweep pages high→low and reverse within each page.
 *  - The vendor keeps only ~7 days of capture records per plaza. Older days answer
 *    `total: 0`, not an error. There is no way to backfill past that.
 *  - `total` OVERCOUNTS: on busy days the vendor's own pages repeat rows. One measured day
 *    reports total=45,419 but yields only 36,670 distinct `unid` — identically, on every
 *    pass, at pageSize 1000/500/200, sweeping pages up or down. So dedupe by `unid` across
 *    the WHOLE day; an adjacent-page guard is not enough.
 *  - The manual export is CLIPPED to the event's operating hours. Verified on a site with
 *    displayHours 10–22: inside 10:00:00–22:00:00 the API and the manual file
 *    hold exactly the same 16,326 rows; all 339 API-only rows sit outside that window.
 *    Writing the unclipped day would inflate every unique-visitor and total-traffic KPI.
 *    The unclipped day is still kept, under source/_fullday/, for diagnostics. That folder is
 *    invisible to rawdataFiles.service: list()/clearAll() call fs.readdir() non-recursively and
 *    keep only names matching /\.(xlsx|xlsm)$/i, which a directory name never does — so the
 *    merge path cannot pick these files up. Re-check that if the listing ever goes recursive.
 */
import ExcelJS from 'exceljs';
import { promises as fs } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  VionClient, VionSource, VionCaptureRecord, clientFromEnv,
} from '../integrations/vion/vion.client';

const prisma = new PrismaClient();

const UPLOADS_ROOT = process.env.EVENT_UPLOADS_ROOT || '/app/uploads/events';
const SOURCE_DIRNAME = 'source';
/** Unclipped copies live here. Must stay a SUBDIRECTORY of source/ with a non-xlsx name. */
const FULLDAY_DIRNAME = '_fullday';
const PAGE_SIZE = 1000;

/** Overall budget for one day's fetch. Default sized from the worst case measured in Step 0: */
/*  busiest Mall site = 901,649 rows = 902 pages @ 1,179 ms/page ≈ 17.7 min; 17.7 × 1.5 ≈ 27 min. */
export const FETCH_TIMEOUT_MS = Number(process.env.VION_FETCH_TIMEOUT_MS) || 1_800_000;

/** Master switch for everything v2. Off → no UI option, no repeatable jobs, /vion/* 404s. */
export function isEventV2Enabled(): boolean {
  return String(process.env.EVENT_V2_ENABLED ?? '').toLowerCase() === 'true';
}

// ──────────────────────────────────────────────────────────────────
// Column derivation — the exact strings the engine compares against
// ──────────────────────────────────────────────────────────────────
// `dashboard_engine.py` matches these as literals:
//   CustomerType != 'Staff'   (_non_staff, drives excludeStaff)
//   Gender == 'Male' / 'Female'
//   Event.isin(['in','out'])  (drives dwell pairing)
// Getting any of them wrong silently changes the numbers instead of failing.

export const AGE_GROUPS = {
  juvenile: 'Juvenile (0-18 yrs)',
  young: 'Young Adults (19-35 yrs)',
  middle: 'Middle-Aged (36-55 yrs)',
  senior: 'Seniors (55+ yrs)',
} as const;

/** `age` is an estimated age in years, not a bucket code. Observed: 5,6,12,18,24,25,30,45,50,60,65. */
export function toAgeGroup(age: number): string {
  if (!Number.isFinite(age)) return AGE_GROUPS.young;
  if (age <= 18) return AGE_GROUPS.juvenile;
  if (age <= 35) return AGE_GROUPS.young;
  if (age <= 55) return AGE_GROUPS.middle;
  return AGE_GROUPS.senior;
}

/** 1 → Male, 0 → Female. -1 (seen on mall-type plazas, never on booth plazas) → Unknown. */
export function toGender(gender: number): string {
  if (gender === 1) return 'Male';
  if (gender === 0) return 'Female';
  return 'Unknown';
}

/** 1 → in, -1 → out, 4/5 → Unknown (passer-by lines). 0/2/22/23 seen on mall plazas, meaning unknown. */
export function toEvent(direction: number): string {
  if (direction === 1) return 'in';
  if (direction === -1) return 'out';
  return 'Unknown';
}

/** 0 → Customer, 1 → Staff. Anything unexpected falls back to Customer: mislabelling a row */
/*  'Staff' would silently drop it from every unique-visitor and dwell metric. */
export function toCustomerType(personType: number): string {
  return personType === 1 ? 'Staff' : 'Customer';
}

/** Header row exactly as the Vion export writes it — blank CustomerType header and Chinese labels included. */
export const VION_EXPORT_HEADER = [
  'No.', 'unid', 'Video Id', 'BodyID', 'Personnel No.', '',
  '年龄', '性别', 'Event', 'Device SN', 'Time', 'Monitoring Point',
] as const;

export interface DerivedWarnings {
  unknownGender: number;
  unknownDirection: number;
  unknownPersonType: number;
  unresolvedLocation: number;
  unresolvedCamera: number;
}

/** Build one output row in engine column order. `no` is the running 1..N counter. */
export function toRow(
  r: VionCaptureRecord,
  no: number,
  locationByUnid: Map<string, string>,
  cameraByUnid: Map<string, string>,
  warn: DerivedWarnings,
): (string | number | null)[] {
  if (r.gender !== 0 && r.gender !== 1) warn.unknownGender++;
  if (r.direction !== 1 && r.direction !== -1 && r.direction !== 4 && r.direction !== 5) warn.unknownDirection++;
  if (r.personType !== 0 && r.personType !== 1) warn.unknownPersonType++;

  const location = locationByUnid.get(r.gateUnid);
  if (!location) warn.unresolvedLocation++;
  const camera = cameraByUnid.get(r.gateUnid);
  if (!camera) warn.unresolvedCamera++;

  return [
    no,                              // No.              — engine uses it only as a count column
    r.unid,                          // unid
    String(r.unid).slice(0, 4),      // Video Id         — verified: always unid[:4]
    r.personUnid,                    // BodyID           — the ReID person, NOT unid
    null,                            // Personnel No.    — vendor-internal, absent from the API, engine ignores it
    toCustomerType(r.personType),    // (blank header)   — CustomerType
    toAgeGroup(r.age),               // 年龄             — AgeGroup
    toGender(r.gender),              // 性别             — Gender
    toEvent(r.direction),            // Event
    camera ?? '',                    // Device SN        — CameraID, engine ignores it
    r.counttimeLocal,                // Time             — site-local already
    location ?? r.gateUnid,          // Monitoring Point — Location
  ];
}

// ──────────────────────────────────────────────────────────────────
// Location + camera catalogues for one plaza
// ──────────────────────────────────────────────────────────────────
export interface PlazaCatalog {
  /** gateUnid|zoneUnid → the name the manual export prints in "Monitoring Point" */
  locationByUnid: Map<string, string>;
  /** gateUnid|zoneUnid → device serial, from device.channelList[].site.gateUnid */
  cameraByUnid: Map<string, string>;
  gates: string[];
  zones: string[];
  deviceCount: number;
}

export async function loadCatalog(client: VionClient, plazaUnid: string): Promise<PlazaCatalog> {
  const [gates, zones, devices] = await Promise.all([
    client.listGates(plazaUnid),
    client.listZones(plazaUnid),
    client.listDevices(plazaUnid),
  ]);

  const locationByUnid = new Map<string, string>();
  for (const g of gates) if (g.gateUnid) locationByUnid.set(g.gateUnid, g.gateName);
  // zoneStatus 2 = superseded rename; including it would overwrite a live zone name with a dead one
  for (const z of zones) if (z.zoneUnid && z.zoneStatus === 1) locationByUnid.set(z.zoneUnid, z.zoneName);

  const cameraByUnid = new Map<string, string>();
  for (const d of devices) {
    for (const ch of d.channelList ?? []) {
      const unid = ch.site?.gateUnid;
      // a gate covered by two devices keeps the first; the column is cosmetic (engine never reads it)
      if (unid && !cameraByUnid.has(unid)) cameraByUnid.set(unid, d.serialnum);
    }
  }

  return {
    locationByUnid,
    cameraByUnid,
    gates: gates.map((g) => g.gateName),
    zones: zones.filter((z) => z.zoneStatus === 1).map((z) => z.zoneName),
    deviceCount: devices.length,
  };
}

// ──────────────────────────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────────────────────────
export function sourceFileName(date: string): string {
  return `CaptureRecordsDetails-${date}.xlsx`;
}

export function fullDayFileName(date: string): string {
  return `CaptureRecordsDetails-${date}-fullday.xlsx`;
}

function sourceDir(eventId: string): string {
  return path.join(UPLOADS_ROOT, eventId, SOURCE_DIRNAME);
}

function fullDayDir(eventId: string): string {
  return path.join(sourceDir(eventId), FULLDAY_DIRNAME);
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// ──────────────────────────────────────────────────────────────────
// fetchDay
// ──────────────────────────────────────────────────────────────────
export interface FetchDayArgs {
  eventId: string;
  server: VionSource;
  plazaId: string;
  /** YYYY-MM-DD, site-local */
  date: string;
  /** false → skip if the file already exists (schedule re-runs must be idempotent) */
  force?: boolean;
  /**
   * Operating-hours window, inclusive on both ends, as the manual export applies it.
   * Defaults to the event's own displayHoursStart/displayHoursEnd — pass these only to override.
   */
  hoursStart?: number;
  hoursEnd?: number;
}

export interface FetchDayResult {
  rows: number;
  filePath: string;
  skipped: boolean;
  /** what the vendor said it had, before paging */
  reportedTotal: number;
  durationMs: number;
  warnings: DerivedWarnings;
  /** rows the vendor returned more than once across the day's pages (see header note) */
  duplicatesDropped: number;
  /** rows the vendor had but the manual export would not contain (outside operating hours) */
  clippedOutOfHours: number;
  hoursStart: number;
  hoursEnd: number;
  /** unclipped copy kept for diagnostics, outside the merge path */
  fullDayFilePath: string;
  fullDayRows: number;
}

export async function fetchDay(args: FetchDayArgs): Promise<FetchDayResult> {
  const { eventId, server, plazaId, date, force = false } = args;
  const startedAt = Date.now();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date must be YYYY-MM-DD, got "${date}"`);

  // The window the manual export uses. Read from the event unless the caller overrides it,
  // so a caller that forgets cannot silently produce an unclipped (KPI-inflating) file.
  let { hoursStart, hoursEnd } = args;
  if (hoursStart == null || hoursEnd == null) {
    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      select: { displayHoursStart: true, displayHoursEnd: true },
    });
    if (!ev) throw new Error(`event ${eventId} not found — cannot resolve its operating hours`);
    hoursStart = hoursStart ?? ev.displayHoursStart;
    hoursEnd = hoursEnd ?? ev.displayHoursEnd;
  }
  const fromTime = `${String(hoursStart).padStart(2, '0')}:00:00`;
  const toTime = `${String(hoursEnd).padStart(2, '0')}:00:00`;
  const inHours = (counttimeLocal: string) => {
    const hhmmss = counttimeLocal.slice(11, 19);
    return hhmmss >= fromTime && hhmmss <= toTime;
  };

  const dir = sourceDir(eventId);
  await fs.mkdir(dir, { recursive: true });
  const fdDir = fullDayDir(eventId);
  await fs.mkdir(fdDir, { recursive: true });
  const filePath = path.join(dir, sourceFileName(date));
  const fullDayFilePath = path.join(fdDir, fullDayFileName(date));

  if (!force && (await exists(filePath))) {
    return {
      rows: 0, filePath, skipped: true, reportedTotal: 0,
      durationMs: Date.now() - startedAt, duplicatesDropped: 0, clippedOutOfHours: 0,
      hoursStart, hoursEnd, fullDayFilePath, fullDayRows: 0,
      warnings: { unknownGender: 0, unknownDirection: 0, unknownPersonType: 0, unresolvedLocation: 0, unresolvedCamera: 0 },
    };
  }

  const deadline = startedAt + FETCH_TIMEOUT_MS;
  const checkDeadline = (where: string) => {
    if (Date.now() > deadline) {
      throw new Error(
        `Vion fetch for ${date} exceeded VION_FETCH_TIMEOUT_MS=${FETCH_TIMEOUT_MS}ms at ${where} ` +
        `(plaza ${plazaId} on ${server}) — raise VION_FETCH_TIMEOUT_MS or narrow the range`,
      );
    }
  };

  const client = clientFromEnv(server);
  const catalog = await loadCatalog(client, plazaId);
  checkDeadline('catalog load');

  // Page 1 tells us how many pages there are. We then sweep high→low so the rows land
  // in the same descending-time order the manual export uses, holding one page at a time.
  const first = await client.captureRecord(plazaId, date, 1, PAGE_SIZE);
  const reportedTotal = first.total;
  const pageCount = first.pages;

  const warnings: DerivedWarnings = {
    unknownGender: 0, unknownDirection: 0, unknownPersonType: 0, unresolvedLocation: 0, unresolvedCamera: 0,
  };
  // counted separately so the reported warnings describe the file the engine will actually read
  const fullDayWarnings: DerivedWarnings = {
    unknownGender: 0, unknownDirection: 0, unknownPersonType: 0, unresolvedLocation: 0, unresolvedCamera: 0,
  };

  const tmpPath = `${filePath}.partial`;
  const fdTmpPath = `${fullDayFilePath}.partial`;
  await fs.rm(tmpPath, { force: true });
  await fs.rm(fdTmpPath, { force: true });

  const mkWriter = (filename: string) => new ExcelJS.stream.xlsx.WorkbookWriter({
    filename,
    useStyles: false,
    useSharedStrings: false,      // inline strings: bigger file, but constant memory
  });
  const wb = mkWriter(tmpPath);
  const ws = wb.addWorksheet('data');   // the manual export's sheet name
  const fdWb = mkWriter(fdTmpPath);
  const fdWs = fdWb.addWorksheet('data');

  let rows = 0;
  let fullDayRows = 0;
  let duplicatesDropped = 0;
  let clippedOutOfHours = 0;
  try {
    ws.addRow(VION_EXPORT_HEADER as unknown as string[]).commit();
    fdWs.addRow(VION_EXPORT_HEADER as unknown as string[]).commit();

    // Every unid seen today. The vendor repeats rows across pages, so this has to span the
    // whole day, not just a page boundary. One UUID string per distinct row: ~80 MB at the
    // worst site measured (~900k rows/day), well inside the container's 8 GB heap — and
    // far cheaper than buffering the rows themselves, which is what lesson #68 warns against.
    const seenUnids = new Set<string>();

    for (let page = pageCount; page >= 1; page--) {
      checkDeadline(`page ${pageCount - page + 1}/${pageCount}`);

      const batch = page === 1 && pageCount === 1
        ? first
        : await client.captureRecord(plazaId, date, page, PAGE_SIZE);

      // ascending from the vendor → reverse to get the export's descending order
      for (let i = batch.records.length - 1; i >= 0; i--) {
        const r = batch.records[i];
        if (seenUnids.has(r.unid)) { duplicatesDropped++; continue; }
        seenUnids.add(r.unid);
        // the unclipped copy gets every deduped row, with its own 1..N counter
        fdWs.addRow(toRow(r, ++fullDayRows, catalog.locationByUnid, catalog.cameraByUnid, fullDayWarnings)).commit();
        if (!inHours(r.counttimeLocal)) { clippedOutOfHours++; continue; }
        ws.addRow(toRow(r, ++rows, catalog.locationByUnid, catalog.cameraByUnid, warnings)).commit();
      }
    }

    await wb.commit();
    await fdWb.commit();
  } catch (err) {
    // never leave a half-written file the merge could pick up
    await fs.rm(tmpPath, { force: true });
    await fs.rm(fdTmpPath, { force: true });
    throw err;
  }

  // rename last: the file only becomes visible to rawdataFiles.list() once it is complete
  await fs.rename(tmpPath, filePath);
  await fs.rename(fdTmpPath, fullDayFilePath);

  const durationMs = Date.now() - startedAt;
  const w = warnings;
  if (w.unknownGender || w.unknownDirection || w.unknownPersonType || w.unresolvedLocation) {
    console.warn(
      `[vion-rawdata] ${eventId} ${date}: ${rows} rows with unmapped values — ` +
      `gender=${w.unknownGender} direction=${w.unknownDirection} personType=${w.unknownPersonType} ` +
      `location=${w.unresolvedLocation} camera=${w.unresolvedCamera}`,
    );
  }
  // rows + duplicates + clipped should account for every row the vendor handed over
  const accounted = rows + duplicatesDropped + clippedOutOfHours;
  if (reportedTotal && accounted !== reportedTotal) {
    console.warn(
      `[vion-rawdata] ${eventId} ${date}: accounted for ${accounted} rows but the vendor reported ` +
      `${reportedTotal} (wrote ${rows}, dropped ${duplicatesDropped} duplicates, ` +
      `clipped ${clippedOutOfHours} outside ${hoursStart}:00-${hoursEnd}:00) — ` +
      `the day may still be being written; re-fetch with force=true once it is closed`,
    );
  }

  return {
    rows, filePath, skipped: false, reportedTotal, durationMs, warnings,
    duplicatesDropped, clippedOutOfHours, hoursStart, hoursEnd,
    fullDayFilePath, fullDayRows,
  };
}

// ──────────────────────────────────────────────────────────────────
// probePlaza — powers the "ทดสอบการเชื่อมต่อ" button in Step 2
// ──────────────────────────────────────────────────────────────────
export interface ProbePlazaResult {
  plazaName: string;
  deviceCount: number;
  /** every name that can appear in the Location column: gates first, then active zones */
  gates: string[];
  zones: string[];
  /** oldest day inside the vendor's retention window that still has rows, or null if none do */
  firstSeen: string | null;
  /** days probed backwards from today while looking for firstSeen */
  retentionProbedDays: number;
}

/** The vendor keeps ~7 days; probe a little past that so a shrinking window still reports honestly. */
const RETENTION_PROBE_DAYS = 10;

export async function probePlaza(argsIn: { server: VionSource; plazaId: string }): Promise<ProbePlazaResult> {
  const { server, plazaId } = argsIn;
  const client = clientFromEnv(server);

  const plazas = await client.listPlazas();
  const plaza = plazas.find((p) => p.plazaUnid === plazaId);
  if (!plaza) throw new Error(`plazaId ${plazaId} not found on ${server} (${plazas.length} plazas on this account)`);

  const catalog = await loadCatalog(client, plazaId);

  let firstSeen: string | null = null;
  for (let back = 0; back <= RETENTION_PROBE_DAYS; back++) {
    const day = siteLocalDay(-back);
    const probe = await client.captureRecord(plazaId, day, 1, 1);
    if (probe.total > 0) firstSeen = day;          // keep walking back; the last hit wins
  }

  return {
    plazaName: plaza.plazaName,
    deviceCount: catalog.deviceCount,
    gates: catalog.gates,
    zones: catalog.zones,
    firstSeen,
    retentionProbedDays: RETENTION_PROBE_DAYS,
  };
}

/**
 * YYYY-MM-DD for the site's own day, `offsetDays` back from now.
 * Sites are Asia/Bangkok unless VION_SITE_TZ says otherwise; the container runs UTC.
 */
export function siteLocalDay(offsetDays = 0, tz = process.env.VION_SITE_TZ || 'Asia/Bangkok'): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Inclusive YYYY-MM-DD range. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export const vionRawdataService = {
  fetchDay, probePlaza, loadCatalog, sourceFileName, fullDayFileName, siteLocalDay, eachDay, isEventV2Enabled,
};
