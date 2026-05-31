import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import { redis } from '../config/redis';
import { eventReportService } from '../services/eventReport.service';

const QUEUE_NAME = 'event-report';

const queueOpts: QueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,                         // engine takes long; don't auto-retry
    removeOnComplete: 100,
    removeOnFail: 100,
  },
};

const workerOpts: WorkerOptions = {
  connection: redis,
  concurrency: 1,                        // run reports one at a time
  // ── Stall protection (lesson learned 2026-05-31) ──
  // The report worker does heavy CPU work that blocks the event loop:
  //   1. ExcelJS merge of source files (~14 min on TCP Thaifex 5-day / 33MB)
  //   2. Spawning + awaiting python engine (~57 min on same event)
  // With BullMQ's default 30s lockDuration, the worker can't renew its
  // lock during the merge phase → BullMQ marks the job stalled → requeue
  // → second engine starts while first is still running → 2x memory →
  // OOM crash loop (observed 2026-05-30: job 73/74 SHIN RAMYUN, job 76
  // TCP Thaifex; latter completed but BullMQ still mis-marked as failed).
  //
  // Mitigation:
  //   - lockDuration: 2h gives plenty of headroom; renew at lockDuration/2
  //     (1h) so a 14-min merge no longer trips it.
  //   - maxStalledCount: 0 — if it ever DOES stall, refuse to requeue.
  //     The engine writes status=COMPLETED to DB on its own; requeue would
  //     duplicate work and risk OOM.
  lockDuration: 2 * 60 * 60 * 1000,      // 2 hours
  maxStalledCount: 0,                    // never requeue stalled jobs
};

// ── Queue (producer) ──
export const eventReportQueue = new Queue<{ reportId: string }>(QUEUE_NAME, queueOpts);

// ── Worker (consumer) — started in server.ts ──
let _worker: Worker | null = null;

export function startEventReportWorker() {
  if (_worker) return _worker;
  _worker = new Worker<{ reportId: string }>(
    QUEUE_NAME,
    async (job) => {
      console.log(`[eventReport] processing report ${job.data.reportId}`);
      await eventReportService.runReport(job.data.reportId);
    },
    workerOpts,
  );

  _worker.on('completed', (job) => {
    console.log(`[eventReport] ✓ report ${job.data.reportId} completed`);
  });
  _worker.on('failed', (job, err) => {
    console.error(`[eventReport] ✗ report ${job?.data.reportId} failed:`, err.message);
  });

  return _worker;
}

export function stopEventReportWorker() {
  return _worker?.close();
}
