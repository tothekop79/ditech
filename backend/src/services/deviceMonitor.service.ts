/**
 * deviceMonitor.service.ts — Sprint 1
 *   syncSites()   : upsert MonitoredSite from plazaInfo (both servers). Run hourly.
 *   pollDevices() : upsert MonitoredDevice, log status changes, open/resolve OFFLINE + DEVICE_MISSING alerts.
 *                   Run every 5 min. 222 sites × 1 call, throttled with small concurrency.
 * Telegram fires ONLY on alert transitions (OPEN / RESOLVED) — never on every poll.
 */
import { PrismaClient } from '@prisma/client';
import { clientsFromEnv, VionClient, VionDevice, VionAccount, VionGroupNode } from '../integrations/vion/vion.client';

const prisma = new PrismaClient();

export const DeviceStatus = { OFFLINE: 0, ONLINE: 1, DISABLED: 3, UNKNOWN: -1 } as const;

// Wire to the existing Telegram dispatcher. Keep the signature tiny so the import is the only edit.
type Notifier = (text: string) => Promise<void>;
let notify: Notifier = async (t) => { console.log('[monitor][telegram-stub]', t); };
export function setNotifier(fn: Notifier) { notify = fn; }

/** Vendor server clock — modifyTime is server-local (GMT+8, verified vs portal 2026-09-17), NOT site tz. */
const VENDOR_SERVER_TZ = process.env.VION_SERVER_TZ || '+08:00';
const POLL_CONCURRENCY = Number(process.env.VION_POLL_CONCURRENCY) || 4;
/** A device must be continuously offline this long (during business hours) before an alert opens.
 *  Cameras miss heartbeats now and then and the vendor flips them offline for ~12 min; 60 min filters that. */
const OFFLINE_GRACE_MS = Number(process.env.VION_OFFLINE_GRACE_MS) || 60 * 60 * 1000;
const DIGEST_ALWAYS = process.env.VION_DIGEST_ALWAYS === 'true';

// ── helpers ────────────────────────────────────────────────────────────────
function parseVendorTime(s?: string, tz = '+07:00'): Date | null {
  if (!s) return null;
  const d = new Date(`${s.replace(' ', 'T')}${tz}`);
  return isNaN(d.getTime()) ? null : d;
}

/** Minutes after opening before a still-offline camera counts as a problem (staff switching things on). */
const OPEN_GRACE_MIN = Number(process.env.VION_OPEN_GRACE_MIN) || 30;
/** Minutes before closing during which going offline is tolerated (staff switching things off early). */
const CLOSE_GRACE_MIN = Number(process.env.VION_CLOSE_GRACE_MIN) || 30;
/** Used when a site reports no usable hours (Mall server: 00:00–00:00 everywhere). */
const DEFAULT_HOURS = { start: process.env.VION_DEFAULT_OPEN || '10:00', end: process.env.VION_DEFAULT_CLOSE || '22:00' };

type BizHour = { week: number; startTime: string; endTime: string };

/** Site-local "now" as minutes since midnight + ISO weekday (1=Mon..7=Sun), from the site's tz offset. */
function siteLocalNow(tz: string, now: Date): { minutes: number; week: number } {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz || '+07:00');
  const offsetMin = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 420;
  const local = new Date(now.getTime() + offsetMin * 60_000);
  const jsDay = local.getUTCDay();                       // 0=Sun
  return { minutes: local.getUTCHours() * 60 + local.getUTCMinutes(), week: jsDay === 0 ? 7 : jsDay };
}
const hm = (s: string) => { const [h, mi] = s.split(':').map(Number); return h * 60 + (mi || 0); };

/**
 * Business-hours verdict for a site at `now`.
 *  - OPEN      : inside hours (after open+grace, before close-grace) → offline is a real problem
 *  - CLOSED    : outside hours → offline is expected, never alert
 *  - TRANSITION: within the grace windows → don't open, don't resolve
 * 00:00–00:00 (or missing) means "unknown" → DEFAULT_HOURS; a site can be marked 24h by setting 00:00–23:59.
 */
export function businessHoursState(hours: unknown, tz: string, now = new Date()): 'OPEN' | 'CLOSED' | 'TRANSITION' {
  const { minutes, week } = siteLocalNow(tz, now);
  const list = Array.isArray(hours) ? (hours as BizHour[]) : [];
  let today = list.find(h => h.week === week);
  let start = today ? hm(today.startTime) : NaN, end = today ? hm(today.endTime) : NaN;
  if (!today || isNaN(start) || isNaN(end) || (start === 0 && end === 0)) { start = hm(DEFAULT_HOURS.start); end = hm(DEFAULT_HOURS.end); }
  if (end <= start) end += 24 * 60;                      // overnight closing (e.g. 10:00–01:00)
  const t = minutes < start && end > 24 * 60 ? minutes + 24 * 60 : minutes;
  if (t < start || t >= end) return 'CLOSED';
  if (t < start + OPEN_GRACE_MIN || t >= end - CLOSE_GRACE_MIN) return 'TRANSITION';
  return 'OPEN';
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = { status: 'fulfilled', value: await fn(items[idx]) }; }
      catch (e) { results[idx] = { status: 'rejected', reason: e }; }
    }
  }));
  return results;
}

// ── sites ──────────────────────────────────────────────────────────────────
/** leaf/any group name → set of top-level account names that contain it (dupes across accounts = ambiguous). */
function buildGroupLookup(accounts: VionAccount[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const walk = (nodes: VionGroupNode[] | undefined, account: string) => {
    for (const n of nodes ?? []) {
      const k = n.name.trim().toLowerCase();
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(account);
      walk(n.children, account);
    }
  };
  for (const a of accounts) walk(a.groups, a.name.trim());
  return m;
}

export async function syncSites(clients: VionClient[] = clientsFromEnv()) {
  const summary: Record<string, any> = {};
  const customers = await prisma.customer.findMany({ select: { id: true, customerName: true } });
  const customerByName = new Map(customers.map(c => [c.customerName.trim().toLowerCase(), c.id]));

  for (const c of clients) {
    const [plazas, accounts] = await Promise.all([c.listPlazas(), c.listGroups()]);
    const lookup = buildGroupLookup(accounts);
    let linked = 0, ambiguous = 0;

    for (const p of plazas) {
      const groupName = p.groupName?.trim() || null;
      const hits = groupName ? [...(lookup.get(groupName.toLowerCase()) ?? [])] : [];
      const accountName = hits.length === 1 ? hits[0] : null;
      const isAmbiguous = hits.length > 1;
      if (isAmbiguous) ambiguous++;

      const existing = await prisma.monitoredSite.findUnique({ where: { source_plazaUnid: { source: c.source, plazaUnid: p.plazaUnid } } });
      // Auto-link ONLY when unlinked or previously vendor-linked; never override a MANUAL choice.
      let customerPatch: { customerId?: string | null; customerSource?: string | null } = {};
      if (!existing?.customerId || existing.customerSource === 'VENDOR') {
        const cid = accountName ? customerByName.get(accountName.toLowerCase()) ?? null : null;
        if (cid) { customerPatch = { customerId: cid, customerSource: 'VENDOR' }; linked++; }
        else if (existing?.customerSource === 'VENDOR') customerPatch = { customerId: null, customerSource: null };
      }

      const common = {
        plazaName: p.plazaName,
        plazaExternalId: p.plazaExternalid || null,
        timeZone: p.timeZone || '+07:00',
        businessHours: p.businessHours ?? undefined,
        vendorGroupName: groupName,
        vendorAccountName: accountName,
        accountAmbiguous: isAmbiguous,
        lastSyncedAt: new Date(),
        ...customerPatch,
      };
      await prisma.monitoredSite.upsert({
        where: { source_plazaUnid: { source: c.source, plazaUnid: p.plazaUnid } },
        create: { source: c.source, plazaUnid: p.plazaUnid, ...common },
        update: common,
      });
    }
    summary[c.source] = { sites: plazas.length, accounts: accounts.length, autoLinked: linked, ambiguous };
  }
  return summary;
}

// ── devices ────────────────────────────────────────────────────────────────
interface PollStats { sites: number; devices: number; changed: number; opened: number; resolved: number; errors: number }

export async function pollDevices(clients: VionClient[] = clientsFromEnv()): Promise<PollStats> {
  const stats: PollStats = { sites: 0, devices: 0, changed: 0, opened: 0, resolved: 0, errors: 0 };
  const byName = Object.fromEntries(clients.map(c => [c.source, c]));

  const sites = await prisma.monitoredSite.findMany({ where: { monitored: true } });
  stats.sites = sites.length;

  const results = await mapLimit(sites, POLL_CONCURRENCY, async (site) => {
    const client = byName[site.source];
    if (!client) return;
    const devices = await client.listDevices(site.plazaUnid);
    const now = new Date();
    const seen = new Set<string>();

    for (const d of devices) {
      seen.add(d.serialnum);
      stats.devices++;
      await upsertDevice(site.id, site.timeZone, d, now, stats);
    }

    // Devices that vanished from the vendor list → DEVICE_MISSING (treat as offline for alerting)
    const missing = await prisma.monitoredDevice.findMany({
      where: { siteId: site.id, serialnum: { notIn: [...seen] }, currentStatus: { not: DeviceStatus.UNKNOWN } },
    });
    for (const m of missing) {
      await transition(m.id, site.id, m.currentStatus, DeviceStatus.UNKNOWN, now, stats, `${site.plazaName} · ${m.name ?? m.serialnum}`);
    }
  });

  // (b) "didn't come back after opening": offline devices with no open alert, at a site that is now OPEN.
  const stillOffline = await prisma.monitoredDevice.findMany({
    where: { currentStatus: { in: [DeviceStatus.OFFLINE, DeviceStatus.UNKNOWN] }, site: { monitored: true },
             statusSince: { lte: new Date(Date.now() - OFFLINE_GRACE_MS) },      // continuously down ≥ grace
             alerts: { none: { state: { in: ['OPEN', 'ACKNOWLEDGED'] } } } },
    include: { site: true },
  });
  const nowTs = new Date();
  for (const d of stillOffline) {
    if (businessHoursState(d.site.businessHours, d.site.timeZone, nowTs) !== 'OPEN') continue;
    const type = d.currentStatus === DeviceStatus.UNKNOWN ? 'DEVICE_MISSING' : 'OFFLINE';
    await prisma.alert.create({ data: {
      type, severity: 'WARN', siteId: d.siteId, deviceId: d.id,
      message: `${d.site.plazaName} · ${d.name ?? d.serialnum} offline ≥ ${Math.round(OFFLINE_GRACE_MS / 60000)} min during business hours`,
      details: { statusSince: d.statusSince },
    } });
    stats.opened++;
  }

  stats.errors = results.filter(r => r.status === 'rejected').length;
  for (const r of results) if (r.status === 'rejected') console.error('[monitor] poll error', (r as PromiseRejectedResult).reason?.message ?? r);
  return stats;
}

async function upsertDevice(siteId: string, tz: string, d: VionDevice, now: Date, stats: PollStats) {
  const existing = await prisma.monitoredDevice.findUnique({ where: { siteId_serialnum: { siteId, serialnum: d.serialnum } } });
  // modifyTime semantics (verified vs portal 2026-09-17): for status=0 it is when the server marked it offline
  // (≈ last heartbeat + 12 min); for status=1 the vendor touches it nightly at 00:00 — NOT a "last seen".
  const vendorModifyTime = parseVendorTime(d.modifyTime, VENDOR_SERVER_TZ);   // NOT site tz — see VENDOR_SERVER_TZ
  const base = {
    name: d.name, mac: d.mac, localIp: d.localIp, channelCount: d.channelCount ?? 1,
    channels: (d.channelList ?? []) as any, vendorModifyTime, lastPolledAt: now,
    ...(d.status === DeviceStatus.ONLINE ? { lastSeenOnline: now } : {}),
  };

  if (!existing) {
    await prisma.monitoredDevice.create({
      data: { siteId, serialnum: d.serialnum, currentStatus: d.status, statusSince: now, ...base },
    });
    return;
  }

  await prisma.monitoredDevice.update({ where: { id: existing.id }, data: base });
  if (existing.currentStatus !== d.status) {
    const site = await prisma.monitoredSite.findUnique({ where: { id: siteId } });
    await transition(existing.id, siteId, existing.currentStatus, d.status, now, stats, `${site?.plazaName} · ${d.name ?? d.serialnum}`);
  }
}

/** Single place where status changes are recorded and alerts opened/resolved. */
async function transition(deviceId: string, siteId: string, from: number, to: number, now: Date, stats: PollStats, label: string) {
  stats.changed++;
  await prisma.$transaction([
    prisma.monitoredDevice.update({ where: { id: deviceId }, data: { currentStatus: to, statusSince: now } }),
    prisma.deviceStatusLog.create({ data: { deviceId, fromStatus: from, toStatus: to, changedAt: now } }),
  ]);

  // Going offline never opens an alert here — a missed heartbeat flips status for a poll or two.
  // The "still offline" pass in pollDevices() opens one once the device has been down ≥ OFFLINE_GRACE_MS
  // during business hours. Recovery resolves silently; the digest reports it.
  if (to === DeviceStatus.ONLINE) {
    const opens = await prisma.alert.findMany({ where: { deviceId, type: { in: ['OFFLINE', 'DEVICE_MISSING'] }, state: { in: ['OPEN', 'ACKNOWLEDGED'] } } });
    for (const a of opens) {
      await prisma.alert.update({ where: { id: a.id }, data: { state: 'RESOLVED', resolvedAt: now, details: { ...(a.details as object ?? {}), from, resolvedLabel: label } } });
      stats.resolved++;
    }
  }
}

/**
 * Periodic Telegram digest (cron in the queue, default 3×/day). One message:
 *   open alerts grouped by customer → site, flagged NEW if not in the previous digest,
 *   plus a count of devices that recovered since the previous digest.
 * "Previous digest" = max(Alert.notifiedAt); no extra state table needed.
 */
export async function sendDigest() {
  const now = new Date();
  const last = (await prisma.alert.aggregate({ _max: { notifiedAt: true } }))._max.notifiedAt ?? new Date(now.getTime() - 6 * 3600_000);
  const [open, recovered] = await Promise.all([
    prisma.alert.findMany({
      where: { state: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      include: { site: { include: { customer: { select: { customerName: true } } } }, device: true },
      orderBy: [{ siteId: 'asc' }, { openedAt: 'asc' }],
    }),
    prisma.alert.count({ where: { state: 'RESOLVED', resolvedAt: { gt: last } } }),
  ]);
  const fresh = open.filter(a => !a.notifiedAt).length;
  if (!open.length && !recovered && !DIGEST_ALWAYS) return { sent: false, open: 0, fresh: 0, recovered: 0 };

  const thTime = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(5, 16).replace('T', ' ');
  const byCustomer = new Map<string, string[]>();
  for (const a of open) {
    const cust = a.site.customer?.customerName ?? '(unassigned)';
    const hrs = Math.round((now.getTime() - a.openedAt.getTime()) / 3600_000);
    const line = `  ${a.notifiedAt ? '•' : '🆕'} ${a.site.plazaName} · ${a.device?.name ?? a.device?.serialnum ?? '-'} — ${hrs} h (since ${thTime(a.openedAt)})`;
    if (!byCustomer.has(cust)) byCustomer.set(cust, []);
    byCustomer.get(cust)!.push(line);
  }
  const body = [...byCustomer.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([cust, lines]) => `${cust} (${lines.length})\n${lines.join('\n')}`).join('\n');
  const header = `📷 DITECH Camera Monitor — ${thTime(now)} TH\n` +
    `ดับอยู่ ${open.length} ตัว (ใหม่ ${fresh}) · กลับมาแล้ว ${recovered} ตัวตั้งแต่รอบก่อน`;
  const text = open.length ? `${header}\n\n${body}` : `${header}\n✅ ไม่มีกล้องดับในเวลาทำการ`;
  await notify(text.length > 3900 ? text.slice(0, 3850) + '\n… (ตัดทอน ดูเต็มใน dashboard)' : text);   // Telegram 4096 limit
  await prisma.alert.updateMany({ where: { id: { in: open.map(a => a.id) } }, data: { notifiedAt: now } });
  return { sent: true, open: open.length, fresh, recovered };
}

// ── read models for the dashboard ──────────────────────────────────────────
export async function fleetOverview() {
  const [bySource, bySite, openAlerts] = await Promise.all([
    prisma.monitoredDevice.groupBy({
      by: ['currentStatus'], _count: { _all: true },
      where: { site: { monitored: true } },
    }),
    prisma.monitoredSite.findMany({
      where: { monitored: true },
      select: {
        id: true, source: true, plazaName: true, plazaUnid: true, customerId: true,
        vendorGroupName: true, vendorAccountName: true, accountAmbiguous: true, customerSource: true,
        customer: { select: { id: true, customerName: true } },
        _count: { select: { devices: true } },
        devices: { select: { currentStatus: true, statusSince: true } },
      },
      orderBy: [{ source: 'asc' }, { plazaName: 'asc' }],
    }),
    prisma.alert.count({ where: { state: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
  ]);

  const total = Object.fromEntries(bySource.map(r => [String(r.currentStatus), r._count._all]));
  const sites = bySite.map(s => {
    const online = s.devices.filter(d => d.currentStatus === 1).length;
    const offline = s.devices.filter(d => d.currentStatus === 0 || d.currentStatus === -1).length;
    return {
      id: s.id, source: s.source, plazaName: s.plazaName, plazaUnid: s.plazaUnid,
      customer: s.customer, customerSource: s.customerSource,
      vendorGroupName: s.vendorGroupName, vendorAccountName: s.vendorAccountName, accountAmbiguous: s.accountAmbiguous,
      devices: s._count.devices, online, offline,
      health: s._count.devices === 0 ? 'EMPTY' : offline === 0 ? 'OK' : online === 0 ? 'DOWN' : 'DEGRADED',
    };
  });
  return {
    devices: { total: Object.values(total).reduce((a, b) => a + b, 0), online: total['1'] ?? 0, offline: total['0'] ?? 0, missing: total['-1'] ?? 0, disabled: total['3'] ?? 0 },
    openAlerts, sites,
  };
}
