#!/usr/bin/env npx tsx
/**
 * vion-probe.ts — call every documented Vion endpoint on BOTH servers once and record what really happens.
 *
 *   docker exec ditech-planner-backend-1 npx tsx scripts/vion-probe.ts [--day=YYYY-MM-DD] [--out=…]
 *
 * Read-only: every call is a GET except the login POST. Sequential, ≥350 ms apart, 20 s timeout,
 * one sample per endpoint per server (+ at most 2 path-variant retries and 3 param repairs).
 * Nothing secret is written: appkey / password / atoken never leave this process except as a 6-char prefix.
 *
 * Output lands next to the script (backend/ is the container's bind mount); move it to docs/ on the host.
 */
import fs from 'fs';
import nodePath from 'path';
import { ENDPOINTS, VionRaw, configFromEnv, localDay, sleep, snakeParams, timeParams, type RawResult, type ServerKey, type VionEndpoint } from './vion';

const GAP_MS = 350;
const MAX_VARIANTS = 3;     // documented path + 2 casing/version retries
const MAX_REPAIRS = 3;      // "<param> cannot be empty" repairs on a path that clearly exists
const MAX_PLAZA_TRIES = 6;  // never sweep all 221 sites

const argv = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : 'true'];
})) as Record<string, string>;

const DAY = argv.day ?? localDay(-1);                       // yesterday, site-local
const OUT = argv.out ?? nodePath.resolve(__dirname, '..', 'vion-probe-results.json');

// ── path variants ──────────────────────────────────────────────────────
/** vendor PDFs mis-case several paths: plazainfo → plazaInfo, floorGateinfo → floorGateInfo */
const camelize = (p: string) => {
  const seg = p.split('/');
  seg[seg.length - 1] = seg[seg.length - 1].replace(/info$/, 'Info').replace(/time$/, 'Time');
  return seg.join('/');
};
const swapVersion = (p: string) => (p.includes('/api/v2/') ? p.replace('/api/v2/', '/api/v1/') : p.replace('/api/v1/', '/api/v2/'));

function variantsFor(e: VionEndpoint): string[] {
  const out: string[] = [];
  for (const v of [e.docPath, camelize(e.docPath), e.path, swapVersion(e.docPath)]) {
    const norm = v.startsWith('/') ? v : `/${v}`;
    if (!out.includes(norm)) out.push(norm);
  }
  return out.slice(0, MAX_VARIANTS);
}

// ── response summarising ───────────────────────────────────────────────
function flatten1(o: any): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(o ?? {})) {
    keys.push(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const k2 of Object.keys(v)) keys.push(`${k}.${k2}`);
    else if (Array.isArray(v) && v[0] && typeof v[0] === 'object') for (const k2 of Object.keys(v[0])) keys.push(`${k}[].${k2}`);
  }
  return keys;
}
const trunc = (v: unknown, n = 40) => {
  const s = v == null ? String(v) : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function rowsOf(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const o: any = data;
    for (const k of ['list', 'records', 'rows', 'data']) if (Array.isArray(o[k])) return o[k];
    return [o];
  }
  return [];
}

interface Summary { dataType: string; rowCount: number | null; keys: string[]; sample: Record<string, string> }
function summarise(data: unknown): Summary {
  if (data == null) return { dataType: 'null', rowCount: 0, keys: [], sample: {} };
  const rows = rowsOf(data);
  const wrapped = !Array.isArray(data) && typeof data === 'object' && rows[0] !== data;
  const first = rows[0];
  return {
    dataType: Array.isArray(data) ? 'array' : wrapped ? 'object{list[]}' : typeof data === 'object' ? 'object' : typeof data,
    rowCount: rows.length,
    keys: first && typeof first === 'object' ? flatten1(first) : [],
    sample: first && typeof first === 'object'
      ? Object.fromEntries(Object.entries(first).slice(0, 3).map(([k, v]) => [k, trunc(v)]))
      : { value: trunc(first) },
  };
}

// ── probe records ──────────────────────────────────────────────────────
interface Attempt { path: string; params: Record<string, string>; httpStatus: number; code: string | null; message: string | null; body?: string; elapsedMs: number }
interface Probe {
  server: ServerKey; key: string; name: string; docPath: string; documentedOn: string;
  /** ok = rows came back · empty = accepted but no data · rejected = vendor said no · missing = path not on this server */
  verdict: 'ok' | 'empty' | 'rejected' | 'missing' | 'skipped';
  finalPath: string | null; finalParams: Record<string, string> | null;
  /** params we had to add or drop versus the PDF */
  paramFixes: string[];
  attempts: Attempt[];
  dataType?: string; rowCount?: number | null; keys?: string[]; sample?: Record<string, string>; elapsedMs?: number;
  altModifyTime?: { accepted: boolean; code: string | null; rowCount: number | null; message: string | null };
  countdateOnly?: { accepted: boolean; rowCount: number | null; sameAsDocumented: boolean };
  _rows?: any[];
}

const attemptOf = (r: RawResult): Attempt => ({
  path: r.path, params: r.params, httpStatus: r.httpStatus, code: r.code,
  message: r.message ?? r.parseError ?? null, body: r.code === '200' ? undefined : r.bodySnippet, elapsedMs: r.elapsedMs,
});
const icon = (v: Probe['verdict']) => ({ ok: '✅', empty: '⚠️ ', rejected: '❌', missing: '⛔', skipped: '· ' })[v];

/** Retail answers every /api/v1/* path with this, whether or not the path exists. */
const isV1TokenGate = (a: Attempt) => a.path.startsWith('/api/v1/') && a.code === '501' && /token/i.test(String(a.message));
/** the attempt worth showing: the first one the vendor really answered */
const bestAttempt = (p: Probe) =>
  p.attempts.find((a) => a.code !== null && !isV1TokenGate(a)) ?? p.attempts.find((a) => a.code !== null) ?? p.attempts.at(-1);

function logRow(p: Probe) {
  const a = bestAttempt(p);
  const detail = p.verdict === 'ok' || p.verdict === 'empty'
    ? `${p.dataType} rows=${p.rowCount ?? '-'} ${p.elapsedMs}ms${p.paramFixes.length ? `  [${p.paramFixes.join(' ')}]` : ''}`
    : `http=${a?.httpStatus ?? '-'} code=${a?.code ?? '(no envelope)'} ${trunc(a?.message, 52)}`;
  console.log(`${icon(p.verdict)} ${p.server.padEnd(6)} ${p.key.padEnd(31)} ${(p.finalPath ?? p.docPath).padEnd(45)} ${detail}`);
}

// ── param repair ───────────────────────────────────────────────────────
interface Ctx {
  plazaUnid?: string; plazaName?: string;
  gateUnid?: string; mallGateUnid?: string;
  zonePlazaUnid?: string; zoneUnid?: string;
  floorPlazaUnid?: string; floorUnid?: string;
}

/** "countdate cannot be empty." → countdate ; also "please input startTime" */
function missingParamFrom(message: string | null): string | null {
  if (!message) return null;
  const m = message.match(/([A-Za-z][A-Za-z0-9_]*)\s*(?:cannot be empty|is required|is null|不能为空)/i)
    ?? message.match(/please\s+input\s+([A-Za-z][A-Za-z0-9_]*)/i);
  return m ? m[1] : null;
}

/** "'timeInterval' must be one of [1, 5, 60]." → { name: 'timeInterval', value: '60' } */
function enumParamFrom(message: string | null): { name: string; value: string } | null {
  const m = message?.match(/'?([A-Za-z][A-Za-z0-9_]*)'?\s+must be one of\s*\[([^\]]+)\]/i);
  if (!m) return null;
  const opts = m[2].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  return { name: m[1], value: opts[opts.length - 1] };        // widest bucket, e.g. 60-minute
}

/** A value for a parameter the vendor asked for but the PDF never mentioned. */
function valueForParam(name: string, ctx: Ctx): string | null {
  const n = name.toLowerCase();
  if (n === 'countdate' || n === 'date' || n === 'countdatelocal') return DAY;
  if (n === 'starttime') return `${DAY} 00:00:00`;
  if (n === 'endtime') return `${DAY} 23:59:59`;
  if (n === 'startdate') return DAY;
  if (n === 'enddate') return DAY;
  if (n === 'pagenum' || n === 'page') return '1';
  if (n === 'pagesize') return '1000';
  if (n === 'hour') return '12';
  if (n === 'plazaunid') return ctx.plazaUnid ?? null;
  if (n === 'gateunid') return ctx.gateUnid ?? null;
  if (n === 'zoneunid' || n === 'storeunid') return ctx.zoneUnid ?? null;
  if (n === 'floorunid') return ctx.floorUnid ?? null;
  return null;
}

// ── the probe ──────────────────────────────────────────────────────────
/** Known-good sample sites, in preference order (prefix match; unids resolved live). */
const PREFERRED: Record<ServerKey, string[]> = {
  mall: ['55b7aac2', 'daafef54', '446d1cd4'],              // SVB (140 devices, gates), Suvarnabhumi, Rang Nam
  retail: ['a286e056', 'edac2de4', '9ec505a8'],            // Central World (6 devices, 7 gates, 10 zones), Makro, One Nimman
};

async function probeEndpoint(raw: VionRaw, e: VionEndpoint, ctx: Ctx, extra: Record<string, string> = {}): Promise<Probe> {
  // zone- and floor-scoped endpoints must use the plaza their sample id belongs to
  const plazaFor = e.needs.includes('zoneUnid') ? (ctx.zonePlazaUnid ?? ctx.plazaUnid)
    : e.needs.includes('floorUnid') ? (ctx.floorPlazaUnid ?? ctx.plazaUnid)
    : ctx.plazaUnid;
  // mall-entrance endpoints want a gate flagged isMallGate=1
  const gateFor = /MallEntrance/i.test(e.key) ? (ctx.mallGateUnid ?? ctx.gateUnid) : ctx.gateUnid;
  const pool: Record<string, string | undefined> = { plazaUnid: plazaFor, gateUnid: gateFor, zoneUnid: ctx.zoneUnid, floorUnid: ctx.floorUnid };

  const params: Record<string, string> = { ...timeParams(e.docTime, DAY), ...extra };
  for (const need of e.needs) { const v = pool[need]; if (v) params[need] = v; }
  if (e.paging) { params.page = '1'; params.pageSize = '1000'; }   // `page`, not the documented `pageNum`

  const p: Probe = {
    server: raw.server, key: e.key, name: e.name, docPath: e.docPath, documentedOn: e.documentedOn.join('+'),
    verdict: 'skipped', finalPath: null, finalParams: null, paramFixes: [], attempts: [],
  };
  const missingIds = e.needs.filter((n) => !params[n]);
  if (missingIds.length) {
    p.attempts.push({ path: e.docPath, params, httpStatus: 0, code: null, message: `skipped — no sample ${missingIds.join('/')} exists on this server`, elapsedMs: 0 });
    return p;
  }

  const accept = (r: RawResult, used: Record<string, string>) => {
    const s = summarise(r.data);
    p.finalPath = r.path; p.finalParams = used; p.elapsedMs = r.elapsedMs; p._rows = rowsOf(r.data);
    Object.assign(p, s);
    p.verdict = s.rowCount === 0 || s.dataType === 'null' ? 'empty' : 'ok';
  };

  for (const variant of variantsFor(e)) {
    await sleep(GAP_MS);
    let r = await raw.get(variant, params);
    p.attempts.push(attemptOf(r));
    if (r.code === '200') { accept(r, params); return p; }
    if (r.httpStatus === 0) return p;                        // network/timeout: stop hammering
    if (r.code === null) continue;                           // no envelope → path not served here, try next casing
    // Retail gates the whole /api/v1 tree behind a token it never issues — not evidence the path exists
    if (variant.startsWith('/api/v1/') && r.code === '501' && /token/i.test(String(r.message))) continue;

    // the vendor answered → this path probably exists. Repair the parameter list before changing the path.
    let work = { ...params };
    let snakeTried = false;
    const fixes: string[] = [];
    for (let i = 0; i < MAX_REPAIRS; i++) {
      const want = missingParamFrom(r.message);
      const enumWant = enumParamFrom(r.message);
      if (want && work[want] == null) {
        const val = valueForParam(want, ctx);
        if (val == null) { fixes.push(`needs:${want}=?`); break; }
        work[want] = val;
        fixes.push(`+${want}`);
      } else if (enumWant && work[enumWant.name] == null) {
        work[enumWant.name] = enumWant.value;
        fixes.push(`+${enumWant.name}=${enumWant.value}`);
      } else if (variant.startsWith('/api/v1/') && !snakeTried) {
        work = snakeParams(work);                            // the v1 API is snake_case: plazaUnid → plaza_unid
        snakeTried = true;
        fixes.push('snake_case');
      } else break;
      await sleep(GAP_MS);
      r = await raw.get(variant, work);
      p.attempts.push(attemptOf(r));
      if (r.code === '200') { p.paramFixes = fixes; accept(r, work); return p; }
      if (r.httpStatus === 0 || r.code === null) break;
    }
    p.paramFixes = fixes;                                    // this variant lost; try the next casing/version
  }
  const answered = p.attempts.some((a) => a.code !== null && !isV1TokenGate(a));
  p.verdict = answered ? 'rejected' : 'missing';
  return p;
}

/** Resolve one usable plaza + a sample gate / zone / floor, with a hard call budget. */
async function resolveIds(raw: VionRaw, plazas: any[], probes: Probe[]): Promise<Ctx> {
  const ctx: Ctx = {};
  const ordered = [
    ...PREFERRED[raw.server].flatMap((pre) => plazas.filter((p) => String(p.plazaUnid).startsWith(pre))),
    ...plazas.filter((p) => !PREFERRED[raw.server].some((pre) => String(p.plazaUnid).startsWith(pre))),
  ];
  if (!ordered.length) return ctx;
  ctx.plazaUnid = ordered[0].plazaUnid; ctx.plazaName = ordered[0].plazaName;

  const ep = (k: string) => ENDPOINTS.find((e) => e.key === k)!;

  // gates decide the sample site (devices were already confirmed non-zero for the preferred sites)
  const gateProbe = await probeEndpoint(raw, ep('gateInfo'), ctx);
  probes.push(gateProbe); logRow(gateProbe);
  let gateRows = gateProbe._rows ?? [];
  if (!gateRows.length && gateProbe.finalPath) {
    for (const cand of ordered.slice(1, MAX_PLAZA_TRIES)) {
      await sleep(GAP_MS);
      const r = await raw.get(gateProbe.finalPath, { plazaUnid: cand.plazaUnid });
      if (r.code === '200' && rowsOf(r.data).length) {
        ctx.plazaUnid = cand.plazaUnid; ctx.plazaName = cand.plazaName; gateRows = rowsOf(r.data);
        console.log(`   ↳ gateInfo: empty on the first site, using ${trunc(cand.plazaName, 28)}`);
        break;
      }
    }
  }
  if (gateRows.length) {
    ctx.gateUnid = String(gateRows[0].gateUnid);
    ctx.mallGateUnid = String((gateRows.find((g: any) => Number(g.isMallGate) === 1) ?? gateRows[0]).gateUnid);
  }

  // zones and floors may live on a different sample site; keep their plaza with them
  const hunt = async (key: string, idField: string) => {
    const p = await probeEndpoint(raw, ep(key), ctx);
    probes.push(p); logRow(p);
    if (p._rows?.[0]?.[idField]) return { plazaUnid: ctx.plazaUnid!, id: String(p._rows[0][idField]), rows: p._rows };
    if (!p.finalPath) return null;
    for (const cand of ordered.slice(0, MAX_PLAZA_TRIES)) {
      if (cand.plazaUnid === ctx.plazaUnid) continue;
      await sleep(GAP_MS);
      const r = await raw.get(p.finalPath, { plazaUnid: cand.plazaUnid });
      const rows = rowsOf(r.data);
      if (r.code === '200' && rows[0]?.[idField]) {
        console.log(`   ↳ ${key}: none on the sample site, found ${idField} on ${trunc(cand.plazaName, 28)}`);
        return { plazaUnid: cand.plazaUnid, id: String(rows[0][idField]), rows };
      }
    }
    return null;
  };

  const zone = await hunt('zoneInfo', 'zoneUnid');
  if (zone) { ctx.zonePlazaUnid = zone.plazaUnid; ctx.zoneUnid = zone.id; }
  const floor = await hunt('floorInfo', 'floorUnid');
  if (floor) { ctx.floorPlazaUnid = floor.plazaUnid; ctx.floorUnid = floor.id; }
  return { ...ctx, _floorRows: floor?.rows } as Ctx;
}

async function probeServer(server: ServerKey) {
  const raw = new VionRaw(configFromEnv(server));
  console.log(`\n══ ${server.toUpperCase()}  ${raw.baseUrl}  (window ${DAY}) ══`);
  const probes: Probe[] = [];

  const login = await raw.login();
  console.log(`${login.ok ? '✅' : '❌'} ${server.padEnd(6)} ${'login'.padEnd(31)} ${'/api/v2/user/login (POST, AES pw)'.padEnd(45)} code=${login.code} token ${raw.tokenPrefix} ${login.elapsedMs}ms`);
  if (!login.ok) return { server, baseUrl: raw.baseUrl, loginOk: false, login: attemptOf(login), ids: {}, probes };

  // the PDFs claim a v1 login that takes the password in clear — check both readings of it
  const altLogins: Record<string, Attempt> = {};
  for (const [label, plain] of [['v1_plain_password', true], ['v1_aes_password', false]] as const) {
    await sleep(GAP_MS);
    const alt = new VionRaw(configFromEnv(server));
    const r = await alt.login('/api/v1/user/login', { plain });
    altLogins[label] = attemptOf(r);
    console.log(`${r.ok ? '✅' : '⛔'} ${server.padEnd(6)} ${`login ${label}`.padEnd(31)} ${'/api/v1/user/login'.padEnd(45)} http=${r.httpStatus} code=${r.code ?? '(no envelope)'} ${trunc(r.message, 40)}`);
  }

  // 1) plazaInfo first — every other id hangs off it
  const plazaProbe = await probeEndpoint(raw, ENDPOINTS.find((e) => e.key === 'plazaInfo')!, {});
  probes.push(plazaProbe); logRow(plazaProbe);
  const plazas: any[] = plazaProbe._rows ?? [];

  // 2) bounded id resolution (its gateInfo/zoneInfo/floorInfo calls are recorded as their own probes)
  const ctx = await resolveIds(raw, plazas, probes);
  const floorRows: any[] = (ctx as any)._floorRows ?? [];
  console.log(`   ids → plaza=${ctx.plazaUnid?.slice(0, 8)}… (${ctx.plazaName ?? '?'})  gate=${ctx.gateUnid?.slice(0, 8) ?? '-'}  mallGate=${ctx.mallGateUnid?.slice(0, 8) ?? '-'}  zone=${ctx.zoneUnid?.slice(0, 8) ?? '-'}  floor=${ctx.floorUnid?.slice(0, 8) ?? '-'}`);

  // 3) the rest of the catalog
  const done = new Set(probes.map((p) => p.key));
  for (const e of ENDPOINTS) {
    if (done.has(e.key)) continue;
    let p = await probeEndpoint(raw, e, ctx);

    // a floor may simply have no gates — try the other floors before calling it empty
    if (e.key === 'floorGateInfo' && p.verdict === 'empty' && p.finalPath) {
      for (const f of floorRows.slice(1, 5)) {
        await sleep(GAP_MS);
        const r = await raw.get(p.finalPath, { floorUnid: f.floorUnid });
        if (r.code === '200' && rowsOf(r.data).length) {
          ctx.floorUnid = String(f.floorUnid);
          p = await probeEndpoint(raw, e, ctx);
          break;
        }
      }
    }
    probes.push(p); logRow(p);
    if (e.key === 'floorGateInfo' && p._rows?.[0]?.gateUnid) (ctx as any).floorGateUnid = String(p._rows[0].gateUnid);

    // did the documented window params matter at all, or is countdate the only time input?
    if (p.paramFixes.includes('+countdate') && p.finalPath && p.finalParams) {
      const minimal = Object.fromEntries(Object.entries(p.finalParams).filter(([k]) => !/^(startTime|endTime|startDate|endDate)$/.test(k)));
      await sleep(GAP_MS);
      const r = await raw.get(p.finalPath, minimal);
      const s2 = summarise(r.data);
      p.countdateOnly = { accepted: r.code === '200', rowCount: r.code === '200' ? s2.rowCount : null, sameAsDocumented: r.code === '200' && s2.rowCount === p.rowCount };
      console.log(`   ↳ countdate alone (no start/end): code=${r.code} rows=${r.code === '200' ? s2.rowCount : '-'}`);
    }

    // second shot with modifyTime instead of a start/end window, where the PDFs offer it
    if (e.modifyTime && (p.verdict === 'ok' || p.verdict === 'empty') && p.finalPath && p.finalParams) {
      await sleep(GAP_MS);
      const mt: Record<string, string> = { modifyTime: `${DAY} 00:00:00` };
      for (const k of ['plazaUnid', 'gateUnid', 'zoneUnid', 'floorUnid']) if (p.finalParams[k]) mt[k] = p.finalParams[k];
      const r = await raw.get(p.finalPath, mt);
      const s = summarise(r.data);
      p.altModifyTime = { accepted: r.code === '200', code: r.code, rowCount: r.code === '200' ? s.rowCount : null, message: r.message };
      console.log(`   ↳ modifyTime instead of a window: code=${r.code} rows=${r.code === '200' ? s.rowCount : '-'} ${trunc(r.message, 40)}`);
    }
  }

  return {
    server, baseUrl: raw.baseUrl, loginOk: true, login: attemptOf(login), altLogins,
    plazaCount: plazas.length,
    ids: { plazaUnid: ctx.plazaUnid, plazaName: ctx.plazaName, gateUnid: ctx.gateUnid, mallGateUnid: ctx.mallGateUnid, zonePlazaUnid: ctx.zonePlazaUnid, zoneUnid: ctx.zoneUnid, floorPlazaUnid: ctx.floorPlazaUnid, floorUnid: ctx.floorUnid },
    probes,
  };
}

/** Belt-and-braces: strip anything that even looks like a credential before writing. */
function redact(json: string): string {
  let out = json;
  for (const k of ['VION_MALL_APPKEY', 'VION_MALL_PASSWORD', 'VION_MALL_USERNAME', 'VION_RETAIL_APPKEY', 'VION_RETAIL_PASSWORD', 'VION_RETAIL_USERNAME']) {
    const v = process.env[k];
    if (v && v.length > 3) out = out.split(v).join('«redacted»');
  }
  return out;
}

async function main() {
  const started = new Date().toISOString();
  const servers: any[] = [];
  for (const s of ['mall', 'retail'] as ServerKey[]) servers.push(await probeServer(s));

  const all: Probe[] = servers.flatMap((s) => s.probes as Probe[]);
  for (const p of all) delete p._rows;                       // in-memory helper only
  const tally = (sv: string) => {
    const p = all.filter((x) => x.server === sv);
    const n = (v: Probe['verdict']) => p.filter((x) => x.verdict === v).length;
    return { ok: n('ok'), empty: n('empty'), rejected: n('rejected'), missing: n('missing'), skipped: n('skipped'), total: p.length };
  };

  const doc = {
    generatedAt: started, finishedAt: new Date().toISOString(),
    window: { day: DAY, tz: process.env.VION_SITE_TZ || 'Asia/Bangkok', note: 'startTime/endTime must stay inside one site-local day' },
    tally: { mall: tally('mall'), retail: tally('retail') },
    servers,
  };
  fs.mkdirSync(nodePath.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, redact(JSON.stringify(doc, null, 2)));
  for (const s of ['mall', 'retail'] as const) {
    const t = doc.tally[s];
    console.log(`${s.padEnd(6)} ✅${t.ok}  ⚠️${t.empty}  ❌${t.rejected}  ⛔${t.missing}  ·${t.skipped}   (${t.total} endpoints)`);
  }
  console.log(`→ ${OUT}`);
}

main().catch((e) => { console.error(String(e?.stack ?? e)); process.exit(1); });
