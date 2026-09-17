/**
 * monitorExport.service.ts — one workbook, five sheets, everything a person needs to work the fleet offline.
 * GET /api/monitor/export.xlsx?source=MALL|RETAIL&all=1
 * All timestamps rendered in Asia/Bangkok. Keys: plazaUnid (sites), serialnum (devices) — names collide.
 */
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { businessHoursState, contractStateOf, DeviceStatus } from './deviceMonitor.service';

const prisma = new PrismaClient();
const TH_OFFSET = 7 * 3600_000;

const th = (d?: Date | null) => d ? new Date(d.getTime() + TH_OFFSET).toISOString().replace('T', ' ').slice(0, 16) : '';
const thDate = (d?: Date | null) => d ? new Date(d.getTime() + TH_OFFSET).toISOString().slice(0, 10) : '';
const hours = (from?: Date | null, to = new Date()) => from ? +((to.getTime() - from.getTime()) / 3600_000).toFixed(1) : '';
const statusText = (s: number) => ({ 0: 'OFFLINE', 1: 'ONLINE', 3: 'DISABLED', [-1]: 'MISSING' } as Record<number, string>)[s] ?? String(s);
const isOff = (s: number) => s === DeviceStatus.OFFLINE || s === DeviceStatus.UNKNOWN;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function hoursText(bh: unknown): string {
  if (!Array.isArray(bh) || !bh.length) return '';
  const byDay = new Map<number, string>();
  for (const h of bh as { week: number; startTime: string; endTime: string }[]) {
    const s = String(h.startTime).slice(0, 5), e = String(h.endTime).slice(0, 5);
    byDay.set(h.week, s === '00:00' && e === '00:00' ? '—' : `${s}-${e}`);
  }
  const vals = [...byDay.values()];
  if (vals.length === 7 && vals.every(v => v === vals[0])) return `daily ${vals[0]}`;
  return DAYS.map((d, i) => `${d} ${byDay.get(i + 1) ?? '—'}`).join(', ');
}

/** uptime% over the window from status-change log: walks transitions per device. */
function uptimePct(logs: { fromStatus: number; toStatus: number; changedAt: Date }[], current: number, since: Date, now: Date): number {
  let cursor = since.getTime(), status = logs.length ? logs[0].fromStatus : current, on = 0;
  for (const l of logs) { if (status === 1) on += l.changedAt.getTime() - cursor; cursor = l.changedAt.getTime(); status = l.toStatus; }
  if (status === 1) on += now.getTime() - cursor;
  return +(100 * on / (now.getTime() - since.getTime())).toFixed(1);
}

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

export async function buildMonitorWorkbook(opts: { source?: string; includeUnmonitored?: boolean }) {
  const now = new Date();
  const src = opts.source === 'MALL' || opts.source === 'RETAIL' ? { source: opts.source } : {};
  const siteWhere = { ...src, ...(opts.includeUnmonitored ? {} : { monitored: true }) };
  const d7 = new Date(now.getTime() - 7 * 86400_000);
  const d30 = new Date(now.getTime() - 30 * 86400_000);

  const [sites, alerts, logs7] = await Promise.all([
    prisma.monitoredSite.findMany({
      where: siteWhere,
      include: {
        customer: { select: { customerName: true, customerCode: true } },
        devices: { include: { alerts: { where: { state: { in: ['OPEN', 'ACKNOWLEDGED'] } }, select: { type: true, state: true, openedAt: true } } } },
        _count: { select: { alerts: { where: { state: { in: ['OPEN', 'ACKNOWLEDGED'] } } } } },
      },
      orderBy: [{ customer: { customerName: 'asc' } }, { plazaName: 'asc' }],
    }),
    prisma.alert.findMany({
      where: { site: siteWhere, OR: [{ state: { in: ['OPEN', 'ACKNOWLEDGED'] } }, { resolvedAt: { gte: d30 } }] },
      include: { site: { select: { plazaName: true, source: true, customer: { select: { customerName: true } } } }, device: { select: { name: true, localIp: true, serialnum: true } } },
      orderBy: [{ state: 'asc' }, { openedAt: 'desc' }],
    }),
    prisma.deviceStatusLog.findMany({
      where: { changedAt: { gte: d7 }, device: { site: siteWhere } },
      include: { device: { select: { id: true, name: true, localIp: true, serialnum: true, site: { select: { plazaName: true, customer: { select: { customerName: true } } } } } } },
      orderBy: { changedAt: 'asc' },
    }),
  ]);

  const logsByDevice = new Map<string, typeof logs7>();
  for (const l of logs7) { if (!logsByDevice.has(l.deviceId)) logsByDevice.set(l.deviceId, []); logsByDevice.get(l.deviceId)!.push(l); }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'DITECH Camera Monitor';
  wb.created = now;

  // ── Sites ────────────────────────────────────────────────────────────────
  const wsS = wb.addWorksheet('Sites');
  wsS.columns = [
    { header: 'plazaUnid', key: 'unid', width: 38 }, { header: 'Source', key: 'source', width: 8 }, { header: 'Site', key: 'name', width: 32 },
    { header: 'Customer', key: 'customer', width: 24 }, { header: 'Customer code', key: 'ccode', width: 14 }, { header: 'Mapping', key: 'csrc', width: 9 },
    { header: 'Vendor account', key: 'vacc', width: 20 }, { header: 'Vendor group', key: 'vgrp', width: 18 },
    { header: 'TZ', key: 'tz', width: 7 }, { header: 'Business hours', key: 'bh', width: 26 }, { header: '24h', key: 'h24', width: 5 },
    { header: 'Monitored', key: 'mon', width: 9 }, { header: 'Cancelled at (TH)', key: 'cancel', width: 17 },
    { header: 'Contract start', key: 'cs', width: 13 }, { header: 'Contract end', key: 'ce', width: 13 }, { header: 'Contract state', key: 'cst', width: 13 },
    { header: 'Days left', key: 'cdl', width: 9 }, { header: 'Contract note', key: 'cnote', width: 30 },
    { header: 'Devices', key: 'dev', width: 8 }, { header: 'Online', key: 'on', width: 7 }, { header: 'Offline', key: 'off', width: 7 },
    { header: 'Missing', key: 'miss', width: 8 }, { header: 'Disabled', key: 'dis', width: 8 }, { header: 'Health', key: 'health', width: 10 },
    { header: 'Store now', key: 'hstate', width: 11 }, { header: 'Offline in hours', key: 'offih', width: 14 }, { header: 'Offline >24h', key: 'off24', width: 11 },
    { header: 'Open alerts', key: 'alerts', width: 10 }, { header: 'Last vendor sync (TH)', key: 'sync', width: 18 },
  ];
  for (const s of sites) {
    const devs = s.devices;
    const online = devs.filter(d => d.currentStatus === 1).length, offline = devs.filter(d => isOff(d.currentStatus)).length;
    const hs = businessHoursState(s.businessHours, s.timeZone, now, s.alwaysOpen);
    const c = contractStateOf(s.contractEnd, now);
    const offSince = (d: typeof devs[number]) => Math.min(d.statusSince?.getTime() ?? Infinity, d.vendorModifyTime?.getTime() ?? Infinity);
    wsS.addRow({
      unid: s.plazaUnid, source: s.source, name: s.plazaName,
      customer: s.customer?.customerName ?? '', ccode: s.customer?.customerCode ?? '', csrc: s.customerSource ?? '',
      vacc: s.vendorAccountName ?? '', vgrp: s.vendorGroupName ?? '', tz: s.timeZone, bh: hoursText(s.businessHours), h24: s.alwaysOpen ? 'Y' : '',
      mon: s.monitored ? 'Y' : 'N', cancel: th(s.cancelledAt),
      cs: thDate(s.contractStart), ce: thDate(s.contractEnd), cst: c.state, cdl: c.daysLeft ?? '', cnote: s.contractNote ?? '',
      dev: devs.length, on: online, off: offline, miss: devs.filter(d => d.currentStatus === -1).length, dis: devs.filter(d => d.currentStatus === 3).length,
      health: devs.length === 0 ? 'EMPTY' : offline === 0 ? 'OK' : online === 0 ? 'DOWN' : 'DEGRADED',
      hstate: hs, offih: hs === 'OPEN' ? offline : 0,
      off24: devs.filter(d => isOff(d.currentStatus) && offSince(d) < now.getTime() - 86400_000).length,
      alerts: s._count.alerts, sync: th(s.lastSyncedAt),
    });
  }
  styleHeader(wsS);

  // ── Devices ──────────────────────────────────────────────────────────────
  const wsD = wb.addWorksheet('Devices');
  wsD.columns = [
    { header: 'Customer', key: 'customer', width: 22 }, { header: 'Source', key: 'source', width: 8 }, { header: 'Site', key: 'site', width: 30 },
    { header: 'Serial', key: 'serial', width: 22 }, { header: 'Device name', key: 'name', width: 16 }, { header: 'Local IP', key: 'ip', width: 15 },
    { header: 'MAC', key: 'mac', width: 18 }, { header: 'Channels', key: 'ch', width: 8 }, { header: 'Gates', key: 'gates', width: 34 },
    { header: 'Status', key: 'status', width: 9 }, { header: 'Since (TH)', key: 'since', width: 17 }, { header: 'Offline hours', key: 'offh', width: 12 },
    { header: 'Vendor mark (TH)', key: 'vmod', width: 17 }, { header: 'Last online (TH)', key: 'lastOn', width: 17 }, { header: 'Last polled (TH)', key: 'polled', width: 17 },
    { header: 'Uptime 7d %', key: 'up7', width: 11 }, { header: 'Transitions 7d', key: 'tr7', width: 13 },
    { header: 'Store now', key: 'hstate', width: 11 }, { header: 'Open alert', key: 'alert', width: 16 }, { header: 'Flags', key: 'flags', width: 26 },
    { header: 'Site monitored', key: 'mon', width: 12 }, { header: 'plazaUnid', key: 'unid', width: 38 },
  ];
  for (const s of sites) {
    const hs = businessHoursState(s.businessHours, s.timeZone, now, s.alwaysOpen);
    for (const d of s.devices) {
      const chans = (Array.isArray(d.channels) ? d.channels : []) as { channelNo?: string; site?: { gateName?: string } }[];
      const gates = chans.map(c => c.site?.gateName).filter(Boolean).join('; ');
      const offSince = isOff(d.currentStatus)
        ? new Date(Math.min(d.statusSince?.getTime() ?? now.getTime(), d.vendorModifyTime?.getTime() ?? now.getTime())) : null;
      const flags: string[] = [];
      if (d.localIp?.startsWith('169.254.')) flags.push('APIPA (no DHCP lease)');
      if (d.name && d.localIp && /^\d+\.\d+\.\d+\.\d+$/.test(d.name) && d.name !== d.localIp) flags.push(`IP drift ${d.name}→${d.localIp}`);
      if (!d.localIp) flags.push('no IP');
      if (isOff(d.currentStatus) && offSince && now.getTime() - offSince.getTime() > 30 * 86400_000) flags.push('offline >30d');
      const lg = logsByDevice.get(d.id) ?? [];
      wsD.addRow({
        customer: s.customer?.customerName ?? '', source: s.source, site: s.plazaName,
        serial: d.serialnum, name: d.name ?? '', ip: d.localIp ?? '', mac: d.mac ?? '', ch: d.channelCount, gates,
        status: statusText(d.currentStatus), since: th(offSince ?? d.statusSince), offh: offSince ? hours(offSince, now) : '',
        vmod: th(d.vendorModifyTime), lastOn: th(d.lastSeenOnline), polled: th(d.lastPolledAt),
        up7: uptimePct(lg, d.currentStatus, d7, now), tr7: lg.length,
        hstate: hs, alert: d.alerts.map(a => `${a.type} (${a.state})`).join('; '), flags: flags.join('; '),
        mon: s.monitored ? 'Y' : 'N', unid: s.plazaUnid,
      });
    }
  }
  styleHeader(wsD);

  // ── Alerts ───────────────────────────────────────────────────────────────
  const wsA = wb.addWorksheet('Alerts');
  wsA.columns = [
    { header: 'State', key: 'state', width: 13 }, { header: 'Type', key: 'type', width: 15 }, { header: 'Severity', key: 'sev', width: 8 },
    { header: 'Customer', key: 'customer', width: 22 }, { header: 'Source', key: 'source', width: 8 }, { header: 'Site', key: 'site', width: 30 },
    { header: 'Device', key: 'dev', width: 16 }, { header: 'IP', key: 'ip', width: 15 }, { header: 'Message', key: 'msg', width: 50 },
    { header: 'Opened (TH)', key: 'opened', width: 17 }, { header: 'Acknowledged (TH)', key: 'ack', width: 17 }, { header: 'Resolved (TH)', key: 'res', width: 17 },
    { header: 'Duration h', key: 'dur', width: 10 }, { header: 'Notified (TH)', key: 'notif', width: 17 },
  ];
  for (const a of alerts) wsA.addRow({
    state: a.state, type: a.type, sev: a.severity, customer: a.site.customer?.customerName ?? '', source: a.site.source, site: a.site.plazaName,
    dev: a.device?.name ?? a.device?.serialnum ?? '', ip: a.device?.localIp ?? '', msg: a.message,
    opened: th(a.openedAt), ack: th(a.acknowledgedAt), res: th(a.resolvedAt), dur: hours(a.openedAt, a.resolvedAt ?? now), notif: th(a.notifiedAt),
  });
  styleHeader(wsA);

  // ── StatusLog (7d) ───────────────────────────────────────────────────────
  const wsL = wb.addWorksheet('StatusLog 7d');
  wsL.columns = [
    { header: 'Changed (TH)', key: 'at', width: 17 }, { header: 'Customer', key: 'customer', width: 22 }, { header: 'Site', key: 'site', width: 30 },
    { header: 'Device', key: 'dev', width: 16 }, { header: 'IP', key: 'ip', width: 15 }, { header: 'From', key: 'from', width: 9 }, { header: 'To', key: 'to', width: 9 },
  ];
  for (const l of logs7) wsL.addRow({
    at: th(l.changedAt), customer: l.device.site.customer?.customerName ?? '', site: l.device.site.plazaName,
    dev: l.device.name ?? l.device.serialnum, ip: l.device.localIp ?? '', from: statusText(l.fromStatus), to: statusText(l.toStatus),
  });
  styleHeader(wsL);

  // ── Customers ────────────────────────────────────────────────────────────
  const wsC = wb.addWorksheet('Customers');
  wsC.columns = [
    { header: 'Customer', key: 'customer', width: 26 }, { header: 'Sites', key: 'sites', width: 6 }, { header: 'Monitored', key: 'mon', width: 9 },
    { header: 'Devices', key: 'dev', width: 8 }, { header: 'Online', key: 'on', width: 7 }, { header: 'Offline', key: 'off', width: 7 }, { header: 'Online %', key: 'pct', width: 8 },
    { header: 'Offline in hours', key: 'offih', width: 14 }, { header: 'Offline >24h', key: 'off24', width: 11 }, { header: 'Open alerts', key: 'alerts', width: 10 },
    { header: 'Uptime 7d % (avg)', key: 'up7', width: 15 }, { header: 'Sites DOWN', key: 'down', width: 10 },
    { header: 'Contract expired', key: 'cexp', width: 14 }, { header: 'Expiring ≤30d', key: 'cexping', width: 12 }, { header: 'No contract', key: 'cnone', width: 11 },
    { header: 'Earliest contract end', key: 'cend', width: 18 },
  ];
  const byCust = new Map<string, typeof sites>();
  for (const s of sites) { const k = s.customer?.customerName ?? '(unassigned)'; if (!byCust.has(k)) byCust.set(k, []); byCust.get(k)!.push(s); }
  for (const [name, list] of [...byCust.entries()].sort(([a], [b]) => (a === '(unassigned)' ? 1 : b === '(unassigned)' ? -1 : a.localeCompare(b)))) {
    const devs = list.flatMap(s => s.devices);
    const online = devs.filter(d => d.currentStatus === 1).length, offline = devs.filter(d => isOff(d.currentStatus)).length;
    const ups = devs.map(d => uptimePct(logsByDevice.get(d.id) ?? [], d.currentStatus, d7, now));
    const cs = list.map(s => contractStateOf(s.contractEnd, now).state);
    const ends = list.map(s => s.contractEnd).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
    wsC.addRow({
      customer: name, sites: list.length, mon: list.filter(s => s.monitored).length, dev: devs.length, on: online, off: offline,
      pct: devs.length ? +(100 * online / devs.length).toFixed(1) : '',
      offih: list.reduce((a, s) => a + (businessHoursState(s.businessHours, s.timeZone, now, s.alwaysOpen) === 'OPEN' ? s.devices.filter(d => isOff(d.currentStatus)).length : 0), 0),
      off24: devs.filter(d => isOff(d.currentStatus) && Math.min(d.statusSince?.getTime() ?? Infinity, d.vendorModifyTime?.getTime() ?? Infinity) < now.getTime() - 86400_000).length,
      alerts: list.reduce((a, s) => a + s._count.alerts, 0),
      up7: ups.length ? +(ups.reduce((a, b) => a + b, 0) / ups.length).toFixed(1) : '',
      down: list.filter(s => s.devices.length > 0 && s.devices.every(d => isOff(d.currentStatus))).length,
      cexp: cs.filter(x => x === 'EXPIRED').length, cexping: cs.filter(x => x === 'EXPIRING').length, cnone: cs.filter(x => x === 'NONE').length,
      cend: thDate(ends[0]),
    });
  }
  styleHeader(wsC);

  // ── README ───────────────────────────────────────────────────────────────
  const wsR = wb.addWorksheet('README');
  [
    `DITECH Camera Monitor export — ${th(now)} (Asia/Bangkok)`,
    `Scope: ${opts.source ?? 'ALL'}${opts.includeUnmonitored ? ' incl. unmonitored' : ' (monitored only)'}`,
    '', 'All timestamps are Thai local time. Keys: plazaUnid (site), Serial (device) — names collide across customers.',
    'Status: ONLINE / OFFLINE / DISABLED (vendor) / MISSING (no longer in vendor device list).',
    '"Since" for offline devices = the earlier of our first observation and the vendor offline mark (≈ last heartbeat + 12 min).',
    '"Store now" = OPEN / CLOSED / TRANSITION per site business hours at export time; offline while CLOSED is normal (stores power cameras off).',
    'Uptime 7d % = share of the last 7 days the device was ONLINE, from status-change log (24h clock, not business hours).',
    'Flags: APIPA = camera got no DHCP lease; IP drift = device name (original IP) ≠ current IP → reserve MAC on the router; offline >30d = likely decommissioned.',
    'Contract state derives from Contract end: EXPIRED / EXPIRING (≤30 days) / ACTIVE / NONE.',
  ].forEach(t => wsR.addRow([t]));
  wsR.getColumn(1).width = 120;

  return wb;
}
