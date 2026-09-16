/**
 * monitor.routes.ts — mount in server.ts:  app.use('/api/monitor', authMiddleware, monitorRoutes);
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { fleetOverview, pollDevices, syncSites, sendDigest } from '../services/deviceMonitor.service';
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
    const { monitored, customerId, alwaysOpen } = req.body ?? {};
    const data: any = {};
    if (typeof monitored === 'boolean') data.monitored = monitored;
    if (typeof alwaysOpen === 'boolean') data.alwaysOpen = alwaysOpen;
    // A human assignment is MANUAL and sticks; clearing it (null) re-opens the site to vendor auto-link on next sync.
    if (customerId === null) { data.customerId = null; data.customerSource = null; }
    else if (typeof customerId === 'string') { data.customerId = customerId; data.customerSource = 'MANUAL'; }
    const site = await prisma.monitoredSite.update({ where: { id: req.params.id }, data });
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
