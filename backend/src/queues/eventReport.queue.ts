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
