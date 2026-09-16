/**
 * deviceMonitor.queue.ts — repeatable jobs.
 * Register once from server.ts:   import { startDeviceMonitor } from './queues/deviceMonitor.queue';  startDeviceMonitor();
 * Uses the same Redis connection as eventReport.queue — copy the `connection` object from there.
 */
import { Queue, Worker } from 'bullmq';
import { syncSites, pollDevices, notifyPendingAlerts } from '../services/deviceMonitor.service';

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
};

const QUEUE = 'device-monitor';
export const deviceMonitorQueue = new Queue(QUEUE, { connection });

const POLL_EVERY_MS = Number(process.env.VION_POLL_INTERVAL_MS) || 5 * 60 * 1000;
const SYNC_EVERY_MS = Number(process.env.VION_SITE_SYNC_INTERVAL_MS) || 60 * 60 * 1000;

export async function startDeviceMonitor() {
  if (process.env.VION_MONITOR_ENABLED === 'false') { console.log('[monitor] disabled by env'); return; }

  // Worker — concurrency 1: poll and sync must never overlap (they touch the same rows).
  new Worker(QUEUE, async (job) => {
    const t0 = Date.now();
    if (job.name === 'sync-sites') {
      const s = await syncSites();
      console.log(`[monitor] sync-sites ${JSON.stringify(s)} in ${Date.now() - t0}ms`);
    } else if (job.name === 'poll-devices') {
      const s = await pollDevices();
      const n = await notifyPendingAlerts();
      console.log(`[monitor] poll ${JSON.stringify(s)} notified=${n} in ${Date.now() - t0}ms`);
    }
  }, {
    connection,
    concurrency: 1,
    lockDuration: 10 * 60 * 1000,   // lesson #71: a full poll of 222 sites can take minutes
    maxStalledCount: 0,
  });

  // Idempotent repeatables (jobId fixed → re-registering on restart is a no-op)
  await deviceMonitorQueue.add('sync-sites', {}, { repeat: { every: SYNC_EVERY_MS }, jobId: 'sync-sites', removeOnComplete: 20, removeOnFail: 50 });
  await deviceMonitorQueue.add('poll-devices', {}, { repeat: { every: POLL_EVERY_MS }, jobId: 'poll-devices', removeOnComplete: 50, removeOnFail: 100 });

  // First run immediately so the dashboard is populated after boot.
  await deviceMonitorQueue.add('sync-sites', {}, { jobId: 'sync-sites-boot', removeOnComplete: true });
  await deviceMonitorQueue.add('poll-devices', {}, { jobId: 'poll-devices-boot', delay: 15_000, removeOnComplete: true });

  console.log(`[monitor] started: poll every ${POLL_EVERY_MS / 60000}m, site sync every ${SYNC_EVERY_MS / 60000}m`);
}
