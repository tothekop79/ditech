/**
 * monitor.routes.ts — mount in server.ts:  app.use('/api/monitor', authMiddleware, monitorRoutes);
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { fleetOverview, pollDevices, syncSites, sendDigest, listFleetDevices } from '../services/deviceMonitor.service';
import { authenticate } from '../middlewares/auth.middleware';

const prisma = new PrismaClient();
const r = Router();
r.use(authenticate);

/** KPI + per-site health for the Fleet Overview page */
/** ?all=1 includes unmonitored sites (demo / finished events) */
r.get('/overview', async (req, res, next) => {
  try { res.json({ success: true, data: await fleetOverview(req.query.all === '1') }); } catch (e) { next(e); }
});

/** Site detail: devices + channels + open alerts */
r.get('/sites/:id', async (req, res, next) => {
  try {
    const site = await prisma.monitoredSite.findUnique({
      where: { id: req.params.id },
      include: {
        customer: { select: { id: true, customerName: true } },
        devices: { orderBy: [{ currentStatus: 'asc' }, { name: 'asc' }] },
        alerts: { where: { state: { in: ['OPEN', 'ACKNOWLEDGED'] } }, orderBy: { openedAt: 'desc' } },
      },
    });
    if (!site) return res.status(404).json({ success: false, message: 'site not found' });
    res.json({ success: true, data: site });
  } catch (e) { next(e); }
});

/** Toggle monitoring / link to customer (used to hide the 26 demo/event sites) */
r.patch('/sites/:id', async (req, res, next) => {
  try {
    const { monitored, customerId, alwaysOpen, contractStart, contractEnd, contractNote } = req.body ?? {};
    const data: any = {};
    if (typeof monitored === 'boolean') data.monitored = monitored;
    if (typeof alwaysOpen === 'boolean') data.alwaysOpen = alwaysOpen;
    const parsedDate = (v: unknown) => v === null ? null : typeof v === 'string' && !isNaN(Date.parse(v)) ? new Date(v) : undefined;
    if (contractStart !== undefined) { const d = parsedDate(contractStart); if (d !== undefined) data.contractStart = d; }
    if (contractEnd !== undefined)   { const d = parsedDate(contractEnd);   if (d !== undefined) data.contractEnd = d; }
    if (contractNote === null || typeof contractNote === 'string') data.contractNote = contractNote;
    // A human assignment is MANUAL and sticks; clearing it (null) re-opens the site to vendor auto-link on next sync.
    if (customerId === null) { data.customerId = null; data.customerSource = null; }
    else if (typeof customerId === 'string') { data.customerId = customerId; data.customerSource = 'MANUAL'; }
    const site = await prisma.monitoredSite.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: site });
  } catch (e) { next(e); }
});

/** Bulk contract: body { siteIds: string[], contractStart?: ISO|null, contractEnd?: ISO|null, contractNote?: string|null }
 *  Typical use: one contract covering every site of a customer → pass all its siteIds. */
r.post('/sites/contract', async (req, res, next) => {
  try {
    const { siteIds, contractStart, contractEnd, contractNote } = req.body ?? {};
    if (!Array.isArray(siteIds) || !siteIds.length) return res.status(400).json({ success: false, message: 'siteIds required' });
    const data: any = {};
    const parsedDate = (v: unknown) => v === null ? null : typeof v === 'string' && !isNaN(Date.parse(v)) ? new Date(v) : undefined;
    if (contractStart !== undefined) { const d = parsedDate(contractStart); if (d !== undefined) data.contractStart = d; }
    if (contractEnd !== undefined)   { const d = parsedDate(contractEnd);   if (d !== undefined) data.contractEnd = d; }
    if (contractNote === null || typeof contractNote === 'string') data.contractNote = contractNote;
    const r2 = await prisma.monitoredSite.updateMany({ where: { id: { in: siteIds } }, data });
    res.json({ success: true, data: { updated: r2.count } });
  } catch (e) { next(e); }
});

/** Cancel a site (customer ended service): monitored=false + cancelledAt=now (+ note). Reversible via PATCH monitored:true. */
r.post('/sites/:id/cancel', async (req, res, next) => {
  try {
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
    const site = await prisma.monitoredSite.update({
      where: { id: req.params.id },
      data: { monitored: false, cancelledAt: new Date(), ...(note !== undefined ? { contractNote: note } : {}) },
    });
    // close whatever is still open for it — nobody will act on a cancelled site
    await prisma.alert.updateMany({ where: { siteId: site.id, state: { in: ['OPEN', 'ACKNOWLEDGED'] } }, data: { state: 'RESOLVED', resolvedAt: new Date() } });
    res.json({ success: true, data: site });
  } catch (e) { next(e); }
});

/** Bulk assign for the 139 sites vendor doesn't group: body { assignments: [{siteId, customerId}] } */
r.post('/sites/assign', async (req, res, next) => {
  try {
    const list: { siteId: string; customerId: string | null }[] = req.body?.assignments ?? [];
    let n = 0;
    for (const a of list) {
      await prisma.monitoredSite.update({
        where: { id: a.siteId },
        data: a.customerId ? { customerId: a.customerId, customerSource: 'MANUAL' } : { customerId: null, customerSource: null },
      });
      n++;
    }
    res.json({ success: true, data: { updated: n } });
  } catch (e) { next(e); }
});

/**
 * Fleet device list — backs the KPI tiles.
 *  ?status=0,-1        currentStatus in list (0 offline · 1 online · 3 disabled · -1 missing)
 *  ?inHours=1          only devices at sites that are OPEN right now (business hours)
 *  ?minOfflineHours=24 offline longer than N hours
 *  ?since=today        statusSince ≥ Bangkok midnight (or an ISO timestamp)
 *  ?customerId=…|none  filter by customer; "none" = unassigned
 *  ?siteId=… ?q=… ?all=1
 */
r.get('/devices', async (req, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const since = q.since === 'today'
      ? (() => { const l = new Date(Date.now() + 7 * 3600_000); return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - 7 * 3600_000); })()
      : q.since ? new Date(q.since) : undefined;
    const data = await listFleetDevices({
      status: q.status ? q.status.split(',').map(Number).filter(n => !isNaN(n)) : undefined,
      inHoursOnly: q.inHours === '1',
      minOfflineHours: q.minOfflineHours ? Number(q.minOfflineHours) : undefined,
      changedSince: since && !isNaN(since.getTime()) ? since : undefined,
      customerId: q.customerId === 'none' ? null : q.customerId || undefined,
      siteId: q.siteId, search: q.q, includeUnmonitored: q.all === '1',
    });
    res.json({ success: true, data, count: data.length });
  } catch (e) { next(e); }
});

/** Alerts list — ?state=OPEN|ACKNOWLEDGED|RESOLVED&type=OFFLINE&siteId=…&limit=100 */
r.get('/alerts', async (req, res, next) => {
  try {
    const { state, type, siteId } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const alerts = await prisma.alert.findMany({
      where: {
        ...(state ? { state } : { state: { in: ['OPEN', 'ACKNOWLEDGED'] } }),
        ...(type ? { type } : {}), ...(siteId ? { siteId } : {}),
      },
      include: { site: { select: { plazaName: true, source: true, customer: { select: { customerName: true } } } },
                 device: { select: { serialnum: true, name: true, localIp: true } } },
      orderBy: { openedAt: 'desc' }, take: limit,
    });
    res.json({ success: true, data: alerts });
  } catch (e) { next(e); }
});

r.post('/alerts/:id/ack', async (req: any, res, next) => {
  try {
    const a = await prisma.alert.update({
      where: { id: req.params.id },
      data: { state: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: req.user?.id ?? null },
    });
    res.json({ success: true, data: a });
  } catch (e) { next(e); }
});

/** Uptime % per device over N days (default 7) from the status log — for the site page sparkline/badge */
r.get('/devices/:id/uptime', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 7, 90);
    const since = new Date(Date.now() - days * 86400_000);
    const dev = await prisma.monitoredDevice.findUnique({ where: { id: req.params.id } });
    if (!dev) return res.status(404).json({ success: false, message: 'device not found' });
    const logs = await prisma.deviceStatusLog.findMany({ where: { deviceId: dev.id, changedAt: { gte: since } }, orderBy: { changedAt: 'asc' } });

    // Walk intervals: status before first log = inverse of its toStatus... simpler: derive from fromStatus.
    let cursor = since.getTime();
    let status = logs.length ? logs[0].fromStatus : dev.currentStatus;
    let onlineMs = 0;
    for (const l of logs) {
      if (status === 1) onlineMs += l.changedAt.getTime() - cursor;
      cursor = l.changedAt.getTime(); status = l.toStatus;
    }
    if (status === 1) onlineMs += Date.now() - cursor;
    const totalMs = Date.now() - since.getTime();
    res.json({ success: true, data: { days, uptimePct: +(100 * onlineMs / totalMs).toFixed(2), transitions: logs.length } });
  } catch (e) { next(e); }
});

/** Manual triggers (admin) — handy while testing without waiting for the repeatable */
r.post('/run/sync', async (_req, res, next) => { try { res.json({ success: true, data: await syncSites() }); } catch (e) { next(e); } });
r.post('/run/poll', async (_req, res, next) => { try { res.json({ success: true, data: await pollDevices() }); } catch (e) { next(e); } });
r.post('/run/digest', async (_req, res, next) => { try { res.json({ success: true, data: await sendDigest() }); } catch (e) { next(e); } });

export default r;
