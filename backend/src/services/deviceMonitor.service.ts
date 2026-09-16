/**
 * deviceMonitor.service.ts — Sprint 1
 *   syncSites()   : upsert MonitoredSite from plazaInfo (both servers). Run hourly.
 *   pollDevices() : upsert MonitoredDevice, log status changes, open/resolve OFFLINE + DEVICE_MISSING alerts.
 *                   Run every 5 min. 222 sites × 1 call, throttled with small concurrency.
 * Telegram fires ONLY on alert transitions (OPEN / RESOLVED) — never on every poll.
 */
import { PrismaClient } from '@prisma/client';
import { clientsFromEnv, VionClient, VionDevice, VionPlaza } from '../integrations/vion/vion.client';

const prisma = new PrismaClient();

export const DeviceStatus = { OFFLINE: 0, ONLINE: 1, DISABLED: 3, UNKNOWN: -1 } as const;

// Wire to the existing Telegram dispatcher. Keep the signature tiny so the import is the only edit.
type Notifier = (text: string) => Promise<void>;
let notify: Notifier = async (t) => { console.log('[monitor][telegram-stub]', t); };
export function setNotifier(fn: Notifier) { notify = fn; }

/** Vendor server clock — modifyTime is server-local (GMT+8, verified vs portal 2026-09-17), NOT site tz. */
const VENDOR_SERVER_TZ = process.env.VION_SERVER_TZ || '+08:00';
const POLL_CONCURRENCY = Number(process.env.VION_POLL_CONCURRENCY) || 4;
/** Debounce: a device must be offline for this long before an alert opens (absorbs 1-poll blips). */
const OFFLINE_GRACE_MS = Number(process.env.VION_OFFLINE_GRACE_MS) || 10 * 60 * 1000;

// ── helpers ────────────────────────────────────────────────────────────────
function parseVendorTime(s?: string, tz = '+07:00'): Date | null {
  if (!s) return null;
  const d = new Date(`${s.replace(' ', 'T')}${tz}`);
  return isNaN(d.getTime()) ? null : d;
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
export async function syncSites(clients: VionClient[] = clientsFromEnv()) {
  const summary: Record<string, number> = {};
  for (const c of clients) {
    const plazas: VionPlaza[] = await c.listPlazas();
    for (const p of plazas) {
      await prisma.monitoredSite.upsert({
        where: { source_plazaUnid: { source: c.source, plazaUnid: p.plazaUnid } },
        create: {
          source: c.source, plazaUnid: p.plazaUnid, plazaName: p.plazaName,
          plazaExternalId: p.plazaExternalid || null,
          timeZone: p.timeZone || '+07:00',
          businessHours: p.businessHours ?? undefined,
          lastSyncedAt: new Date(),
        },
        update: {
          plazaName: p.plazaName,
          plazaExternalId: p.plazaExternalid || null,
          timeZone: p.timeZone || '+07:00',
          businessHours: p.businessHours ?? undefined,
          lastSyncedAt: new Date(),
        },
      });
    }
    summary[c.source] = plazas.length;
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

  stats.errors = results.filter(r => r.status === 'rejected').length;
  for (const r of results) if (r.status === 'rejected') console.error('[monitor] poll error', (r as PromiseRejectedResult).reason?.message ?? r);
  return stats;
}

async function upsertDevice(siteId: string, tz: string, d: VionDevice, now: Date, stats: PollStats) {
  const existing = await prisma.monitoredDevice.findUnique({ where: { siteId_serialnum: { siteId, serialnum: d.serialnum } } });
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

  const type = to === DeviceStatus.UNKNOWN ? 'DEVICE_MISSING' : 'OFFLINE';
  const isBad = to === DeviceStatus.OFFLINE || to === DeviceStatus.UNKNOWN;

  if (isBad) {
    // grace: open only if no open alert AND (first-seen offline + grace elapsed handled by resolveGraceAlerts)
    const open = await prisma.alert.findFirst({ where: { deviceId, type, state: { in: ['OPEN', 'ACKNOWLEDGED'] } } });
    if (!open) {
      await prisma.alert.create({
        data: { type, severity: 'WARN', siteId, deviceId, message: `${label} → ${type}`, details: { from, to } },
      });
      stats.opened++;
    }
  } else if (to === DeviceStatus.ONLINE) {
    const opens = await prisma.alert.findMany({ where: { deviceId, type: { in: ['OFFLINE', 'DEVICE_MISSING'] }, state: { in: ['OPEN', 'ACKNOWLEDGED'] } } });
    for (const a of opens) {
      await prisma.alert.update({ where: { id: a.id }, data: { state: 'RESOLVED', resolvedAt: now } });
      stats.resolved++;
      const mins = Math.round((now.getTime() - a.openedAt.getTime()) / 60000);
      if (mins * 60000 >= OFFLINE_GRACE_MS) await notify(`✅ ONLINE ${label}\nกลับมาหลังจาก ${mins} นาที`);
    }
  }
}

/** Notify OPEN alerts once they have survived the grace window. Call right after pollDevices(). */
export async function notifyPendingAlerts() {
  const cutoff = new Date(Date.now() - OFFLINE_GRACE_MS);
  const due = await prisma.alert.findMany({
    where: { state: 'OPEN', notifiedAt: null, openedAt: { lte: cutoff } },
    include: { site: true, device: true },
    orderBy: { openedAt: 'asc' },
    take: 50,
  });
  if (!due.length) return 0;
  const lines = due.map(a => `🔴 ${a.type} ${a.site.plazaName} · ${a.device?.name ?? a.device?.serialnum ?? '-'} (since ${a.openedAt.toISOString().slice(11, 16)}Z)`);
  await notify(`DITECH Camera Monitor — ${due.length} alert(s)\n${lines.join('\n')}`);
  await prisma.alert.updateMany({ where: { id: { in: due.map(a => a.id) } }, data: { notifiedAt: new Date() } });
  return due.length;
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
      customer: s.customer, devices: s._count.devices, online, offline,
      health: s._count.devices === 0 ? 'EMPTY' : offline === 0 ? 'OK' : online === 0 ? 'DOWN' : 'DEGRADED',
    };
  });
  return {
    devices: { total: Object.values(total).reduce((a, b) => a + b, 0), online: total['1'] ?? 0, offline: total['0'] ?? 0, missing: total['-1'] ?? 0, disabled: total['3'] ?? 0 },
    openAlerts, sites,
  };
}
