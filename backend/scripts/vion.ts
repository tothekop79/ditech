#!/usr/bin/env npx tsx
/**
 * vion.ts — read-only CLI + shared raw layer for the two Vion servers.
 *
 *   docker exec ditech-planner-backend-1 npx tsx scripts/vion.ts <mall|retail> <endpoint|path> [--flags]
 *
 * Reuses backend/src/integrations/vion/vion.client.ts for the AES-ECB login recipe
 * (encryptPassword) so the crypto lives in exactly one place.
 *
 * NEVER prints appkey / password / atoken. Tokens are shown as their first 6 chars.
 */
import fs from 'fs';
import { encryptPassword } from '../src/integrations/vion/vion.client';

// ───────────────────────────── types ─────────────────────────────
export type ServerKey = 'mall' | 'retail';
export type TimeStyle = 'none' | 'datetime' | 'date' | 'countdate';
export type IdParam = 'plazaUnid' | 'floorUnid' | 'gateUnid' | 'zoneUnid';

export interface VionEndpoint {
  key: string;
  name: string;
  /** exactly as printed in the vendor PDF (casing included) — the probe always starts here */
  docPath: string;
  /** verified working path */
  path: string;
  /** per-server override where the two servers serve it under different paths */
  pathByServer?: Partial<Record<ServerKey, string>>;
  /** servers the PDFs document it for (the probe checks both anyway) */
  documentedOn: ServerKey[];
  /** servers it actually answers on (filled in from the probe) */
  liveOn?: ServerKey[];
  needs: IdParam[];
  /** the vendor's real name for an id param where it differs, e.g. zoneUnid → storeUnid */
  paramAlias?: Partial<Record<IdParam, string>>;
  /** time params the PDF documents */
  docTime: TimeStyle;
  /** time params that actually work */
  time: TimeStyle;
  /** extra query params the vendor demands but the PDF never mentions */
  extraParams?: Record<string, string>;
  paging?: boolean;
  /** endpoint also accepts modifyTime=<YYYY-MM-DD HH:mm:ss> as an incremental cursor */
  modifyTime?: boolean;
  note?: string;
}

/** The /api/v1 API (Mall only) is snake_case throughout: plazaUnid → plaza_unid. */
export const toSnake = (k: string) => k.replace(/([A-Z])/g, '_$1').toLowerCase();
export const snakeParams = (p: Record<string, string>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [toSnake(k), v]));

/** Resolve the path + id-param names for one endpoint on one server. */
export function resolveEndpoint(e: VionEndpoint, server: ServerKey) {
  const path = e.pathByServer?.[server] ?? e.path;
  return { path, isV1: path.startsWith('/api/v1/') };
}

export interface RawResult {
  path: string;
  params: Record<string, string>;
  httpStatus: number;
  elapsedMs: number;
  code: string | null;
  message: string | null;
  data: unknown;
  parseError?: string;
  /** first 240 chars of the raw body — the vendor answers some errors with a body that has no `code` */
  bodySnippet?: string;
}

// ───────────────────────────── catalog ─────────────────────────────
// `path` values marked (verified) were confirmed live; the rest are the probe's starting guess.
export const ENDPOINTS: VionEndpoint[] = [
  // —— base / metadata ——
  { key: 'plazaInfo', name: 'Mall/Store Info List', docPath: '/api/v2/base/plazainfo', path: '/api/v2/base/plazaInfo', documentedOn: ['mall', 'retail'], needs: [], docTime: 'none', time: 'none', liveOn: ['mall', 'retail'] },
  { key: 'groupInfo', name: 'Account → group tree', docPath: '/api/v2/base/groupInfo', path: '/api/v2/base/groupInfo', documentedOn: ['retail'], needs: [], docTime: 'none', time: 'none', pathByServer: { mall: '/api/v1/base/groupInfo' }, liveOn: ['mall', 'retail'], note: 'different shapes: Retail v2 = [{name, groups[]}] tree, Mall v1 = flat [{id, pid, name, name_en}]' },
  { key: 'device', name: 'Device Info', docPath: '/api/v1/base/device', path: '/api/v2/base/device', documentedOn: ['mall', 'retail'], needs: ['plazaUnid'], docTime: 'none', time: 'none', liveOn: ['mall', 'retail'] },
  { key: 'gateInfo', name: 'Entrance Info List', docPath: '/api/v2/base/gateinfo', path: '/api/v2/base/gateInfo', documentedOn: ['mall', 'retail'], needs: ['plazaUnid'], docTime: 'none', time: 'none', liveOn: ['mall', 'retail'] },
  { key: 'floorInfo', name: 'Floor Info List', docPath: '/api/v2/base/floorinfo', path: '/api/v2/base/floorInfo', documentedOn: ['mall'], needs: ['plazaUnid'], docTime: 'none', time: 'none', liveOn: ['mall'] },
  { key: 'floorGateInfo', name: 'Floor-Entrance Info List', docPath: '/api/v2/base/floorGateinfo', path: '/api/v2/base/floorGateInfo', documentedOn: ['mall'], needs: ['floorUnid'], docTime: 'none', time: 'none', liveOn: ['mall'] },
  { key: 'zoneInfo', name: 'Store/Zone Info List', docPath: '/api/v2/base/zoneinfo', path: '/api/v2/base/zoneInfo', documentedOn: ['mall', 'retail'], needs: ['plazaUnid'], docTime: 'none', time: 'none', liveOn: ['mall', 'retail'] },
  { key: 'zoneGateInfo', name: 'Store-Entrance Info List', docPath: '/api/v2/base/zoneGateInfo', path: '/api/v2/base/zoneGateInfo', documentedOn: ['mall'], needs: ['zoneUnid'], docTime: 'none', time: 'none', paramAlias: { zoneUnid: 'storeUnid' }, liveOn: ['mall'] },

  // —— counting (reid) ——
  { key: 'mallCountingDataHourly', name: 'Mall Counting Data Hourly', docPath: '/api/v2/reid/mallCountingDataHourly', path: '/api/v2/reid/mallCountingDataHourly', documentedOn: ['mall', 'retail'], needs: ['plazaUnid'], docTime: 'datetime', time: 'datetime', liveOn: ['mall', 'retail'] },
  { key: 'mallCountingDataDaily', name: 'Mall Counting Data Daily', docPath: '/api/v2/reid/mallCountingDataDaily', path: '/api/v2/reid/mallCountingDataDaily', documentedOn: ['mall'], needs: ['plazaUnid'], docTime: 'date', time: 'countdate', liveOn: ['mall', 'retail'] },
  { key: 'floorCountingDataHourly', name: 'Floor Counting Data Hourly', docPath: '/api/v2/reid/floorCountingDataHourly', path: '/api/v2/reid/floorCountingDataHourly', documentedOn: ['mall'], needs: ['plazaUnid', 'floorUnid'], docTime: 'datetime', time: 'datetime', liveOn: ['mall'] },
  { key: 'floorCountingDataDaily', name: 'Floor Counting Data Daily', docPath: '/api/v2/reid/floorCountingDataDaily', path: '/api/v2/reid/floorCountingDataDaily', documentedOn: ['mall'], needs: ['plazaUnid', 'floorUnid'], docTime: 'date', time: 'countdate', liveOn: ['mall'] },
  { key: 'mallEntranceCountingDataHourly', name: 'Mall Entrance Counting Hourly', docPath: '/api/v2/reid/mallEntranceCountingDataHourly', path: '/api/v2/reid/mallEntranceCountingDataHourly', documentedOn: ['mall'], needs: ['plazaUnid', 'gateUnid'], docTime: 'datetime', time: 'datetime', liveOn: ['mall'] },
  { key: 'mallEntranceCountingDataDaily', name: 'Mall Entrance Counting Daily', docPath: '/api/v2/reid/mallEntranceCountingDataDaily', path: '/api/v2/reid/mallEntranceCountingDataDaily', documentedOn: ['mall'], needs: ['plazaUnid', 'gateUnid'], docTime: 'date', time: 'countdate', liveOn: ['mall'] },
  { key: 'floorEntranceCountingDataHourly', name: 'Floor Entrance Counting Hourly', docPath: '/api/v2/reid/floorEntranceCountingDataHourly', path: '/api/v2/reid/floorEntranceCountingDataHourly', documentedOn: ['mall'], needs: ['plazaUnid', 'floorUnid', 'gateUnid'], docTime: 'datetime', time: 'datetime', liveOn: ['mall'] },
  { key: 'floorEntranceCountingDataDaily', name: 'Floor Entrance Counting Daily', docPath: '/api/v2/reid/floorEntranceCountingDataDaily', path: '/api/v2/reid/floorEntranceCountingDataDaily', documentedOn: ['mall'], needs: ['plazaUnid', 'floorUnid', 'gateUnid'], docTime: 'date', time: 'countdate', liveOn: ['mall'] },
  { key: 'storeCountingDataHourly', name: 'Store Counting Data Hourly', docPath: '/api/v2/reid/storeCountingDataHourly', path: '/api/v2/reid/storeCountingDataHourly', documentedOn: ['mall'], needs: ['plazaUnid', 'zoneUnid'], docTime: 'datetime', time: 'datetime', paramAlias: { zoneUnid: 'storeUnid' }, liveOn: ['mall'] },
  { key: 'storeCountingDataDaily', name: 'Store Counting Data Daily', docPath: '/api/v2/reid/storeCountingDataDaily', path: '/api/v2/reid/storeCountingDataDaily', documentedOn: ['mall'], needs: ['plazaUnid', 'zoneUnid'], docTime: 'date', time: 'countdate', paramAlias: { zoneUnid: 'storeUnid' }, liveOn: ['mall'] },
  { key: 'entranceCountingDataHourly', name: 'Entrance Hourly Data', docPath: '/api/v2/reid/entranceCountingDataHourly', path: '/api/v2/reid/entranceCountingDataHourly', documentedOn: ['retail'], needs: ['plazaUnid', 'gateUnid'], docTime: 'datetime', time: 'datetime', liveOn: ['retail'] },

  // —— dwell time / ReID records ——
  { key: 'zoneDwellTime', name: 'Store DwellTime (zone)', docPath: '/api/v2/reid/zoneDwellTime', path: '/api/v2/reid/zoneDwellTime', documentedOn: ['mall'], needs: ['plazaUnid', 'zoneUnid'], docTime: 'datetime', time: 'countdate', paramAlias: { zoneUnid: 'storeUnid' }, liveOn: ['mall'] },
  { key: 'mallDwellTime', name: 'Store DwellTime (whole site)', docPath: '/api/v2/reid/mallDwellTime', path: '/api/v2/reid/mallDwellTime', documentedOn: ['retail'], needs: ['plazaUnid'], docTime: 'datetime', time: 'countdate', liveOn: ['mall', 'retail'] },
  { key: 'plazaResidence', name: 'DwellTime, every customer (site)', docPath: '/api/v1/residence/plazaResidence', path: '/api/v1/residence/plazaResidence', documentedOn: ['mall', 'retail'], needs: ['plazaUnid'], docTime: 'countdate', time: 'countdate', liveOn: ['mall'], note: 'v1 API — snake_case params (plaza_unid), plain-password v1 token, Mall only. NO paging: returns every visit of the day in one response (23k rows at SVB).' },
  { key: 'zoneResidence', name: 'DwellTime, every customer (zone)', docPath: '/api/v1/residence/zoneResidence', path: '/api/v1/residence/zoneResidence', documentedOn: ['mall'], needs: ['plazaUnid', 'zoneUnid'], docTime: 'countdate', time: 'countdate', liveOn: ['mall'], note: 'v1 API — snake_case params, Mall only, no paging' },
  { key: 'captureRecord', name: 'Capture / ReID record', docPath: '/api/v2/captureRecord', path: '/api/v2/captureRecord', documentedOn: ['mall', 'retail'], needs: ['plazaUnid'], docTime: 'countdate', time: 'countdate', paging: true, liveOn: ['mall', 'retail'], note: 'pages with page= (the documented pageNum is ignored); envelope is {records, total, size, current, pages}' },

  // —— counting (passenger) ——
  { key: 'gateHour', name: 'Entrance Counting Hourly', docPath: '/api/v1/passenger/gateHour', path: '/api/v2/passenger/gateHour', documentedOn: ['mall', 'retail'], needs: ['plazaUnid', 'gateUnid'], docTime: 'datetime', time: 'datetime', modifyTime: true, liveOn: ['mall', 'retail'] },
  { key: 'gateDay', name: 'Entrance Counting Daily', docPath: '/api/v2/passenger/gateDay', path: '/api/v2/passenger/gateDay', documentedOn: ['retail'], needs: ['plazaUnid', 'gateUnid'], docTime: 'date', time: 'date', modifyTime: true, liveOn: ['mall', 'retail'] },
  { key: 'gateTenMins', name: 'Entrance Counting (10 minutes)', docPath: '/api/v2/passenger/gateTenMins', path: '/api/v2/passenger/gateTenMins', documentedOn: ['mall'], needs: ['plazaUnid', 'gateUnid'], docTime: 'datetime', time: 'datetime', liveOn: ['mall', 'retail'] },
  { key: 'passengerPlazaHour', name: 'Site Hourly Counting (passenger)', docPath: '/api/v2/passenger/plazaHour', path: '/api/v2/passenger/plazaHour', documentedOn: ['retail'], needs: ['plazaUnid'], docTime: 'datetime', time: 'datetime', modifyTime: true, liveOn: ['mall', 'retail'] },
  { key: 'plazaDay', name: 'Site Daily Counting (passenger)', docPath: '/api/v2/passenger/plazaDay', path: '/api/v2/passenger/plazaDay', documentedOn: ['retail'], needs: ['plazaUnid'], docTime: 'date', time: 'date', modifyTime: true, liveOn: ['mall', 'retail'] },

  // —— demographics (reid) ——
  { key: 'plazaHour', name: 'Site Hourly Customer Segment (reid)', docPath: '/api/v2/reid/plazaHour', path: '/api/v2/reid/plazaHour', documentedOn: ['retail'], needs: ['plazaUnid'], docTime: 'datetime', time: 'datetime', modifyTime: true, liveOn: ['retail'] },
  { key: 'reidGateDay', name: 'Entrance Daily Demographics', docPath: '/api/v2/reid/gateDay', path: '/api/v2/reid/gateDay', documentedOn: ['retail'], needs: ['plazaUnid', 'gateUnid'], docTime: 'date', time: 'date', modifyTime: true, liveOn: ['mall', 'retail'] },
  { key: 'reidGateHour', name: 'Entrance Hourly Demographics', docPath: '/api/v2/reid/gateHour', path: '/api/v2/reid/gateHour', documentedOn: ['retail'], needs: ['plazaUnid', 'gateUnid'], docTime: 'datetime', time: 'datetime', modifyTime: true, liveOn: ['mall', 'retail'] },

  // —— retail-only extras ——
  { key: 'heatMap', name: 'Heatmap', docPath: '/api/v2/heatMap', path: '/api/v2/heatMap', documentedOn: ['retail'], needs: ['plazaUnid'], docTime: 'countdate', time: 'countdate', liveOn: ['retail'] },
  { key: 'gateFlowDirection', name: 'Entrance Visitor Flow', docPath: '/api/v2/gateFlowDirection', path: '/api/v2/gateFlowDirection', documentedOn: ['retail'], needs: ['plazaUnid', 'gateUnid'], docTime: 'datetime', time: 'countdate', liveOn: ['retail'] },
  { key: 'zoneStat', name: 'Store zone data (daily)', docPath: '/api/v2/zoneStat', path: '/api/v2/zoneStat', documentedOn: ['retail'], needs: ['plazaUnid', 'zoneUnid'], docTime: 'date', time: 'countdate', liveOn: ['retail'] },
  { key: 'zoneHourStat', name: 'Store zone data (hourly)', docPath: '/api/v2/zoneHourStat', path: '/api/v2/zoneHourStat', documentedOn: ['retail'], needs: ['plazaUnid', 'zoneUnid'], docTime: 'datetime', time: 'countdate', liveOn: ['retail'] },
  { key: 'queueDay', name: 'Queue daily data', docPath: '/api/v2/queue/day', path: '/api/v2/queue/day', documentedOn: ['retail'], needs: ['plazaUnid'], docTime: 'date', time: 'date', liveOn: ['retail'] },
  { key: 'queueHour', name: 'Queue hourly data', docPath: '/api/v2/queue/hour', path: '/api/v2/queue/hour', documentedOn: ['retail'], needs: ['plazaUnid'], docTime: 'datetime', time: 'countdate', extraParams: { timeInterval: '60' }, liveOn: ['retail'] },
];

export const ENDPOINT_BY_KEY = new Map(ENDPOINTS.map((e) => [e.key.toLowerCase(), e]));

// ───────────────────────────── raw client ─────────────────────────────
export interface RawConfig { server: ServerKey; baseUrl: string; appkey: string; username: string; password: string; timeoutMs?: number }

export function configFromEnv(server: ServerKey): RawConfig {
  const p = server === 'mall' ? 'VION_MALL' : 'VION_RETAIL';
  const e = process.env;
  const baseUrl = e[`${p}_BASE_URL`];
  if (!baseUrl || !e[`${p}_APPKEY`]) throw new Error(`${p}_BASE_URL / ${p}_APPKEY missing from env`);
  return {
    server,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    appkey: e[`${p}_APPKEY`]!,
    username: e[`${p}_USERNAME`] ?? '',
    password: e[`${p}_PASSWORD`] ?? '',
    timeoutMs: Number(e.VION_TIMEOUT_MS) || 20_000,
  };
}

/**
 * Thin raw accessor: everything the probe needs (http status, envelope code, timing) that
 * VionClient.get() deliberately hides behind exceptions. Read-only: only GET + the login POST.
 */
/**
 * Thin raw accessor: everything the probe needs (http status, envelope code, timing) that
 * VionClient.get() deliberately hides behind exceptions. Read-only: only GET + the login POST.
 *
 * Two APIs live on these hosts and they do NOT share conventions:
 *   /api/v2/**  envelope {code, success, message, data}   login: AES-ECB password, atoken under data
 *   /api/v1/**  envelope {msg_code, msg_info, data}       login: PLAIN password, atoken at top level
 * The v1 API only exists on Mall; on Retail every /api/v1 path answers 501 "atoken verification failed".
 */
export class VionRaw {
  private tokenV2: string | null = null;
  private tokenV1: string | null = null;
  private v1LoginFailed = false;
  constructor(private readonly cfg: RawConfig) {}

  get baseUrl() { return this.cfg.baseUrl; }
  get server() { return this.cfg.server; }
  /** first 6 chars only — never log the whole token */
  get tokenPrefix() { return this.tokenV2 ? `${this.tokenV2.slice(0, 6)}…` : '(none)'; }

  private async fetchWithTimeout(url: string, init: RequestInit) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.cfg.timeoutMs ?? 20_000);
    try { return await fetch(url, { ...init, signal: ctl.signal }); }
    finally { clearTimeout(t); }
  }

  /** POST /api/v{1,2}/user/login — the only non-GET call in this tool. v1 wants the password in clear. */
  async login(path = '/api/v2/user/login', opts: { plain?: boolean } = {}): Promise<RawResult & { ok: boolean }> {
    const plain = opts.plain ?? path.includes('/v1/');
    const t0 = Date.now();
    const res = await this.fetchWithTimeout(`${this.cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appkey: this.cfg.appkey,
        username: this.cfg.username,
        password: plain ? this.cfg.password : encryptPassword(this.cfg.appkey, this.cfg.password),
      }),
    });
    const elapsedMs = Date.now() - t0;
    const text = await res.text();
    let j: any = null; let parseError: string | undefined;
    try { j = JSON.parse(text); } catch { parseError = `non-JSON response (${text.slice(0, 80)})`; }
    const tok: string | null = j?.data?.atoken ?? j?.atoken ?? null;   // v2 nests it, v1 does not
    if (tok) { if (path.includes('/v1/')) this.tokenV1 = tok; else this.tokenV2 = tok; }
    return {
      path, params: { appkey: '***', username: '***', password: plain ? '*** (plain)' : '*** (AES)' },
      httpStatus: res.status, elapsedMs,
      code: envelopeCode(j), message: envelopeMessage(j),
      data: tok ? { atoken: `${tok.slice(0, 6)}…` } : (j?.data ?? null),
      parseError, bodySnippet: tok ? undefined : text.slice(0, 240),
      ok: Boolean(tok),
    };
  }

  /** The token this path needs, logging in on demand. */
  private async tokenFor(path: string): Promise<string | null> {
    if (path.startsWith('/api/v1/')) {
      if (!this.tokenV1 && !this.v1LoginFailed) {
        const r = await this.login('/api/v1/user/login');
        if (!r.ok) this.v1LoginFailed = true;
      }
      if (this.tokenV1) return this.tokenV1;                 // Mall
    }
    if (!this.tokenV2) await this.login();
    return this.tokenV2;                                     // Retail v1 falls back here and gets a 501
  }

  /** GET with the right token; one silent re-login on a token error. Never throws on code≠200. */
  async get(path: string, params: Record<string, string | undefined> = {}, retry = true): Promise<RawResult> {
    const tok = await this.tokenFor(path);
    const clean = Object.entries(params).filter(([, v]) => v != null && v !== '') as [string, string][];
    const qs = new URLSearchParams(clean).toString();
    const url = `${this.cfg.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const t0 = Date.now();
    let res: Response;
    try {
      res = await this.fetchWithTimeout(url, { headers: { Authorization: tok ?? '' } });
    } catch (e: any) {
      return { path, params: Object.fromEntries(clean), httpStatus: 0, elapsedMs: Date.now() - t0, code: null, message: e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e), data: null };
    }
    const elapsedMs = Date.now() - t0;
    const text = await res.text();
    let j: any = null; let parseError: string | undefined;
    try { j = text ? JSON.parse(text) : null; } catch { parseError = `non-JSON response (${text.slice(0, 80)})`; }
    const code = envelopeCode(j);
    const message = envelopeMessage(j);
    if (retry && code && code !== '200' && /token/i.test(String(message))) {
      if (path.startsWith('/api/v1/')) this.tokenV1 = null; else this.tokenV2 = null;
      return this.get(path, params, false);
    }
    return {
      path, params: Object.fromEntries(clean), httpStatus: res.status, elapsedMs, code, message,
      data: j ? (j.data ?? null) : null, parseError,
      bodySnippet: code === '200' ? undefined : text.slice(0, 240),
    };
  }
}

/** v2 answers {code,…}; v1 answers {msg_code,…}; a Spring 404 page answers {status,error,…}. */
function envelopeCode(j: any): string | null {
  if (!j || typeof j !== 'object') return null;
  if (j.code !== undefined) return String(j.code);
  if (j.msg_code !== undefined) return String(j.msg_code);
  if (j.atoken !== undefined) return '200';
  return null;
}
function envelopeMessage(j: any): string | null {
  return j?.message ?? j?.msg ?? j?.msg_info ?? j?.error ?? null;
}

// ───────────────────────────── time helpers ─────────────────────────────
export const SITE_TZ = process.env.VION_SITE_TZ || 'Asia/Bangkok';

/** YYYY-MM-DD for "today + offsetDays" in the site timezone. */
export function localDay(offsetDays = 0, tz = SITE_TZ): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Vendor rule: startTime/endTime must sit inside ONE site-local day. */
export function timeParams(style: TimeStyle, day: string): Record<string, string> {
  switch (style) {
    case 'datetime': return { startTime: `${day} 00:00:00`, endTime: `${day} 23:59:59` };
    case 'date': return { startDate: day, endDate: day };
    case 'countdate': return { countdate: day };
    default: return {};
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────── output helpers ─────────────────────────────
function truncate(v: unknown, n = 40): string {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function renderTable(rows: any[], limit = 20): string {
  if (!rows.length) return '(0 rows)';
  const shown = rows.slice(0, limit);
  const cols: string[] = [];
  for (const r of shown) for (const k of Object.keys(r ?? {})) if (!cols.includes(k)) cols.push(k);
  const width = (c: string) => Math.max(c.length, ...shown.map((r) => truncate(r?.[c]).length));
  const w = Object.fromEntries(cols.map((c) => [c, Math.min(width(c), 40)]));
  const line = (cells: string[]) => cells.map((s, i) => s.padEnd(w[cols[i]])).join('  ');
  const out = [line(cols), cols.map((c) => '─'.repeat(w[c])).join('  ')];
  for (const r of shown) out.push(line(cols.map((c) => truncate(r?.[c]))));
  if (rows.length > limit) out.push(`… ${rows.length - limit} more`);
  return out.join('\n');
}

function toCsv(rows: any[]): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r ?? {})) if (!cols.includes(k)) cols.push(k);
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return ['﻿' + cols.join(','), ...rows.map((r) => cols.map((c) => esc(r?.[c])).join(','))].join('\n');
}

// ───────────────────────────── CLI ─────────────────────────────
const USAGE = `
vion — read-only Vion OpenAPI CLI

  npx tsx scripts/vion.ts <mall|retail> <endpointName|/raw/path> [options]
  npx tsx scripts/vion.ts list                       # show the endpoint catalog

Options
  --plazaUnid=…  --gateUnid=…  --zoneUnid=…  --floorUnid=…
  --day=YYYY-MM-DD        one site-local day (default: yesterday)
  --from=… --to=…         date range; hourly endpoints are looped one day at a time
  --modifyTime="YYYY-MM-DD HH:mm:ss"   incremental cursor (vendor server time, GMT+8)
  --page=1 --size=1000    paging (pageNum/pageSize);  --all-pages follows until empty
  --max-pages=N           safety cap for --all-pages (default 200) — captureRecord can run to
                          tens of thousands of rows per site-day
  --timeStyle=datetime|date|countdate|none   only needed for raw paths
  --json | --table        output format (default: table, first 20 rows)
  --out=file.json|.csv    write full result to a file
  --limit=N               rows to show in table mode (default 20)
  --quiet                 suppress the header line

Any other --key=value is passed straight through as a query parameter.
`.trim();

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...rest] = a.slice(2).split('=');
      flags[k] = rest.length ? rest.join('=') : 'true';
    } else positional.push(a);
  }
  return { positional, flags };
}

const RESERVED = new Set(['day', 'from', 'to', 'json', 'table', 'out', 'page', 'size', 'all-pages', 'max-pages', 'timeStyle', 'limit', 'quiet', 'help']);

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || positional[0] === 'help' || !positional.length) { console.log(USAGE); process.exit(positional.length ? 0 : 1); }

  if (positional[0] === 'list') {
    console.log(`${'endpoint'.padEnd(31)} ${'verified path'.padEnd(45)} ${'live on'.padEnd(13)} params`);
    for (const e of ENDPOINTS) {
      const params = [...e.needs.map((n) => e.paramAlias?.[n] ?? n), e.time !== 'none' ? e.time : '', ...Object.keys(e.extraParams ?? {}), e.paging ? 'pageNum/pageSize' : ''].filter(Boolean);
      const live = (e.liveOn ?? []).join('+') || '—';
      const alt = e.pathByServer ? `  (mall: ${e.pathByServer.mall})` : '';
      console.log(`${e.key.padEnd(31)} ${e.path.padEnd(45)} ${live.padEnd(13)} ${params.join(', ')}${alt}`);
    }
    return;
  }

  const server = positional[0] as ServerKey;
  if (server !== 'mall' && server !== 'retail') { console.error(`first argument must be 'mall' or 'retail' (got '${server}')`); process.exit(2); }
  const target = positional[1];
  if (!target) { console.error('missing <endpointName|/raw/path>'); process.exit(2); }

  const ep = ENDPOINT_BY_KEY.get(target.toLowerCase());
  const path = ep ? resolveEndpoint(ep, server).path : target.startsWith('/') ? target : `/${target}`;
  const isV1 = path.startsWith('/api/v1/');
  const style: TimeStyle = (flags.timeStyle as TimeStyle) ?? ep?.time ?? (flags.day || flags.from ? 'datetime' : 'none');
  if (ep?.liveOn && !ep.liveOn.includes(server)) console.error(`⚠ ${ep.key} is not served on ${server} (live on: ${ep.liveOn.join(', ') || 'neither'})`);

  // ids + passthrough params
  let base: Record<string, string> = { ...(ep?.extraParams ?? {}) };
  for (const [k, v] of Object.entries(flags)) if (!RESERVED.has(k)) base[k] = v;
  if (flags.page) base.page = flags.page;                     // the vendor reads `page`, not the documented `pageNum`
  if (flags.size) base.pageSize = flags.size;
  if (ep?.paging && !base.page) { base.page = '1'; base.pageSize = flags.size ?? '1000'; }
  if (ep) for (const need of ep.needs) {
    if (!base[need]) { console.error(`⚠ ${ep.key} needs --${need}=…`); continue; }
    const alias = ep.paramAlias?.[need];                       // vendor calls a zone a "store" in places
    if (alias && alias !== need) { base[alias] = base[need]; delete base[need]; }
  }

  // day window(s)
  let days: string[] = [];
  if (style !== 'none' && !flags.modifyTime) {
    if (flags.from) days = eachDay(flags.from, flags.to ?? flags.from);
    else days = [flags.day ?? localDay(-1)];
  }
  // daily endpoints take a real range in one call
  if (style === 'date' && days.length > 1) days = [days[0]];
  const dateRange = style === 'date' && flags.from ? { startDate: flags.from, endDate: flags.to ?? flags.from } : null;

  const raw = new VionRaw(configFromEnv(server));
  const login = await raw.login();
  if (!login.ok) { console.error(`login failed on ${server}: code=${login.code} ${login.message ?? ''}`); process.exit(1); }
  if (!flags.quiet) console.error(`# ${server} ${raw.baseUrl}  token ${raw.tokenPrefix}  →  GET ${path}`);

  const windows: Record<string, string>[] = dateRange ? [dateRange]
    : days.length ? days.map((d) => timeParams(style, d))
    : [{}];

  const rows: any[] = [];
  let lastObject: unknown = null;
  let first = true;
  for (const win of windows) {
    let page = Number(base.page ?? 1);
    for (;;) {
      if (!first) await sleep(350);
      first = false;
      let params: Record<string, string> = { ...base, ...win, ...(flags.modifyTime ? { modifyTime: flags.modifyTime } : {}), ...(base.page ? { page: String(page) } : {}) };
      if (isV1) params = snakeParams(params);                  // the v1 API is snake_case throughout
      const r = await raw.get(path, params);
      if (r.httpStatus === 404) { console.error(`404 ${path} — wrong casing or wrong server?`); process.exit(1); }
      if (r.code !== '200') {
        console.error(`vendor error on ${path}: http=${r.httpStatus} code=${r.code ?? '(absent)'} ${r.message ?? r.parseError ?? ''}`);
        if (r.bodySnippet) console.error(`body: ${r.bodySnippet}`);
        process.exit(1);
      }
      const d: any = r.data;
      const batch = Array.isArray(d) ? d : Array.isArray(d?.list) ? d.list : Array.isArray(d?.records) ? d.records : null;
      if (batch) rows.push(...batch); else lastObject = d;
      if (!flags['all-pages'] || !batch || batch.length === 0) break;
      // the paged envelope tells us when to stop; a server that ignores `page` would loop forever otherwise
      if (d?.pages != null && page >= Number(d.pages)) break;
      if (d?.current != null && Number(d.current) !== page) {
        console.error(`⚠ the server ignored page=${page} (it answered current=${d.current}); stopping instead of re-reading page 1`);
        break;
      }
      if (page - Number(base.page ?? 1) + 1 >= Number(flags['max-pages'] ?? 200)) {
        console.error(`stopped at --max-pages=${flags['max-pages'] ?? 200} (${rows.length} rows so far); raise it or narrow the window`);
        break;
      }
      page += 1;
      if (!flags.quiet && page % 10 === 0) console.error(`… page ${page}, ${rows.length} rows`);
    }
  }

  const payload: unknown = rows.length || !lastObject ? rows : lastObject;

  if (flags.out) {
    const body = flags.out.endsWith('.csv') ? toCsv(Array.isArray(payload) ? payload : [payload]) : JSON.stringify(payload, null, 2);
    fs.writeFileSync(flags.out, body);
    console.error(`wrote ${flags.out} (${Array.isArray(payload) ? payload.length : 1} row(s))`);
  }
  if (flags.json || !Array.isArray(payload)) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(renderTable(payload, Number(flags.limit ?? 20)));
    console.log(`\n${payload.length} row(s)${windows.length > 1 ? ` across ${windows.length} day(s)` : ''}`);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(String(e?.stack ?? e)); process.exit(1); });
}
