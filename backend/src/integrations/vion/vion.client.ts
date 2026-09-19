/**
 * VionClient — one client for BOTH vendor servers (verified 2026-09-05):
 *   Mall   http://mall.vion-cloud.com:18080
 *   Retail http://retail.vionyun.com:18085
 *
 * Verified facts (do not trust the PDFs where they disagree):
 *  - POST /api/v2/user/login  body {appkey, username, password: AES-ECB(appkey)+base64}
 *    response {code:200, data:{atoken}}   — works on BOTH servers
 *  - GET  /api/v2/base/plazaInfo          — case-sensitive! "plazainfo" → 404
 *  - GET  /api/v2/base/device?plazaUnid=  — identical shape on both servers
 *  - Header: `Authorization: <atoken>`     — no "Bearer", no query param
 *  - Token failure → {code:"-1", message:"token verification failed"} (HTTP 200!)
 */
import crypto from 'crypto';

export type VionSource = 'MALL' | 'RETAIL';

export interface VionConfig {
  source: VionSource;
  baseUrl: string;
  appkey: string;
  username: string;
  password: string;
  timeoutMs?: number;
}

export interface VionGroupNode { id: number; parentId: number; name: string; children?: VionGroupNode[] }
export interface VionAccount { name: string; groups: VionGroupNode[] }

export interface VionPlaza {
  plazaUnid: string;
  plazaName: string;
  plazaExternalid?: string | null;
  groupName?: string | null;                          // Retail: leaf group name; resolve via listGroups()
  address?: string;
  timeZone?: string;                                  // Retail only, sometimes ""
  businessHours?: { week: number; startTime: string; endTime: string }[];
  launchTime?: string;
}

export interface VionChannel {
  serialnum: string;
  channelNo: string;
  deviceId?: number;
  gateId?: number;
  site?: { gateUnid: string; gateName: string; isMallGate: number };
}

export interface VionDevice {
  serialnum: string;
  name: string;
  channelCount: number;
  mac: string;
  localIp: string;
  status: number;                                     // 0 offline · 1 online · 3 disabled
  modifyTime: string;                                 // "YYYY-MM-DD HH:mm:ss" site-local
  bindTime?: string;
  channelList?: VionChannel[];
}

export interface VionGateHour {
  plazaUnid: string;
  gateUnid: string;
  countdate: string;
  counttimeLocal: string;
  innum: number;
  outnum: number;
  customerNum?: number;
  modifyTime?: string;
}

export interface VionGate {
  plazaUnid: string;
  gateUnid: string;
  gateName: string;
  isMallGate?: number;
  isPassBy?: number;
  gateStatus?: number;
}

export interface VionZone {
  plazaUnid: string;
  zoneUnid: string;
  zoneName: string;
  labelName?: string;
  /** 1 = active. Inactive (2) rows are superseded renames and must be ignored. */
  zoneStatus?: number;
}

/** One row of /api/v2/captureRecord. `gateUnid` is a *location* unid: it is a gate OR a zone. */
export interface VionCaptureRecord {
  unid: string;
  personUnid: string;
  personType: number;
  gateUnid: string;
  plazaUnid: string;
  age: number;
  gender: number;
  direction: number;
  /** "YYYY-MM-DD HH:mm:ss" — already SITE-LOCAL, never convert it. */
  counttimeLocal: string;
  countdate: string;
}

/** captureRecord is the only paged endpoint. `size` is capped at 1000 server-side. */
export interface VionPage<T> { records: T[]; total: number; size: number; current: number; pages: number }

interface Envelope<T> { code: number | string; success: boolean; message?: string; msg?: string; data: T }

export class VionAuthError extends Error {}
export class VionApiError extends Error {
  constructor(msg: string, public readonly code?: number | string) { super(msg); }
}

/** AES-ECB/PKCS7 + base64, key = appkey bytes (vendor Java sample uses SecretKeySpec(appkey.getBytes(),"AES")). */
export function encryptPassword(appkey: string, password: string): string {
  const key = Buffer.from(appkey, 'utf8');
  const algo = ({ 16: 'aes-128-ecb', 24: 'aes-192-ecb', 32: 'aes-256-ecb' } as Record<number, string>)[key.length];
  if (!algo) throw new Error(`appkey length ${key.length} is not 16/24/32 bytes`);
  const c = crypto.createCipheriv(algo, key, null);
  return Buffer.concat([c.update(password, 'utf8'), c.final()]).toString('base64');
}

export class VionClient {
  private token: string | null = null;
  private loginPromise: Promise<string> | null = null;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: VionConfig) {
    this.timeoutMs = cfg.timeoutMs ?? 20_000;
  }

  get source() { return this.cfg.source; }

  // ── auth ────────────────────────────────────────────────────────────────
  private async login(): Promise<string> {
    if (this.loginPromise) return this.loginPromise;          // dedupe concurrent re-logins
    this.loginPromise = (async () => {
      const res = await this.rawFetch('/api/v2/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appkey: this.cfg.appkey,
          username: this.cfg.username,
          password: encryptPassword(this.cfg.appkey, this.cfg.password),
        }),
      });
      const j = (await res.json()) as Envelope<{ atoken?: string }>;
      const tok = j?.data?.atoken;
      if (!tok) throw new VionAuthError(`[${this.cfg.source}] login failed: ${j?.message ?? res.status}`);
      this.token = tok;
      return tok;
    })().finally(() => { this.loginPromise = null; });
    return this.loginPromise;
  }

  private async rawFetch(path: string, init: RequestInit): Promise<Response> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.cfg.baseUrl}${path}`, { ...init, signal: ctl.signal });
    } finally { clearTimeout(t); }
  }

  /** GET with token; on token failure re-login once and retry. Vendor returns HTTP 200 with code:"-1" on auth errors. */
  private async get<T>(path: string, params: Record<string, string | undefined> = {}, retry = true): Promise<T> {
    const tok = this.token ?? (await this.login());
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as [string, string][]).toString();
    const res = await this.rawFetch(`${path}${qs ? `?${qs}` : ''}`, { headers: { Authorization: tok } });
    if (res.status === 404) throw new VionApiError(`[${this.cfg.source}] 404 ${path}`, 404);
    const j = (await res.json()) as Envelope<T>;
    const code = String(j.code);
    if (code === '200') return j.data;
    const msg = j.message ?? j.msg ?? '';
    if (retry && /token/i.test(msg)) {
      this.token = null;
      return this.get<T>(path, params, false);
    }
    throw new VionApiError(`[${this.cfg.source}] ${path} → ${code} ${msg}`, j.code);
  }

  // ── endpoints ────────────────────────────────────────────────────────────
  listPlazas(): Promise<VionPlaza[]> {
    return this.get<VionPlaza[]>('/api/v2/base/plazaInfo');
  }

  /** Retail only — Mall returns 404, which we treat as "no grouping" rather than an error. */
  async listGroups(): Promise<VionAccount[]> {
    try { return (await this.get<VionAccount[] | null>('/api/v2/base/groupInfo')) ?? []; }
    catch (e) { if (e instanceof VionApiError && e.code === 404) return []; throw e; }
  }

  async listDevices(plazaUnid: string): Promise<VionDevice[]> {
    return (await this.get<VionDevice[] | null>('/api/v2/base/device', { plazaUnid })) ?? [];
  }

  /** startTime/endTime MUST be within one site-local day (vendor constraint). */
  async gateHour(plazaUnid: string, day: string, gateUnid?: string): Promise<VionGateHour[]> {
    return (await this.get<VionGateHour[] | null>('/api/v2/passenger/gateHour', {
      plazaUnid, gateUnid, startTime: `${day} 00:00:00`, endTime: `${day} 23:59:59`,
    })) ?? [];
  }

  async listGates(plazaUnid: string): Promise<VionGate[]> {
    return (await this.get<VionGate[] | null>('/api/v2/base/gateInfo', { plazaUnid })) ?? [];
  }

  /** Not served on every account (Retail店 404s on some) — treated as "no zones" rather than an error. */
  async listZones(plazaUnid: string): Promise<VionZone[]> {
    try { return (await this.get<VionZone[] | null>('/api/v2/base/zoneInfo', { plazaUnid })) ?? []; }
    catch (e) { if (e instanceof VionApiError && e.code === 404) return []; throw e; }
  }

  /**
   * One page of capture records for one site-local day.
   * `pageSize` above 1000 is silently clamped by the vendor — do not bother asking for more.
   * Rows come back strictly ASCENDING by `counttimeLocal`, across pages.
   */
  async captureRecord(plazaUnid: string, countdate: string, page: number, pageSize = 1000): Promise<VionPage<VionCaptureRecord>> {
    const d = await this.get<VionPage<VionCaptureRecord> | null>('/api/v2/captureRecord', {
      plazaUnid, countdate, page: String(page), pageSize: String(pageSize),
    });
    return {
      records: d?.records ?? [],
      total: Number(d?.total ?? 0),
      size: Number(d?.size ?? pageSize),
      current: Number(d?.current ?? page),
      pages: Number(d?.pages ?? 0),
    };
  }
}

// ── factory from env (Sprint 1). Move to ApiSource table with encrypted secrets in Sprint 2. ──
export function clientsFromEnv(): VionClient[] {
  const out: VionClient[] = [];
  const mk = (source: VionSource, prefix: string) => {
    const e = process.env;
    if (!e[`${prefix}_BASE_URL`] || !e[`${prefix}_APPKEY`]) return;
    out.push(new VionClient({
      source,
      baseUrl: e[`${prefix}_BASE_URL`]!.replace(/\/+$/, ''),
      appkey: e[`${prefix}_APPKEY`]!,
      username: e[`${prefix}_USERNAME`]!,
      password: e[`${prefix}_PASSWORD`]!,
      timeoutMs: Number(e.VION_TIMEOUT_MS) || 20_000,
    }));
  };
  mk('MALL', 'VION_MALL');
  mk('RETAIL', 'VION_RETAIL');
  return out;
}

/** One client for one server, by name. Same env vars as clientsFromEnv(). */
export function clientFromEnv(source: VionSource): VionClient {
  const prefix = source === 'MALL' ? 'VION_MALL' : 'VION_RETAIL';
  const e = process.env;
  if (!e[`${prefix}_BASE_URL`] || !e[`${prefix}_APPKEY`]) {
    throw new Error(`Vion ${source} is not configured — set ${prefix}_BASE_URL and ${prefix}_APPKEY`);
  }
  return new VionClient({
    source,
    baseUrl: e[`${prefix}_BASE_URL`]!.replace(/\/+$/, ''),
    appkey: e[`${prefix}_APPKEY`]!,
    username: e[`${prefix}_USERNAME`]!,
    password: e[`${prefix}_PASSWORD`]!,
    timeoutMs: Number(e.VION_TIMEOUT_MS) || 20_000,
  });
}
