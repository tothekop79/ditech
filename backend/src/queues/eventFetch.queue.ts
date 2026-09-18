/**
 * eventFetch.queue — Event Report v2: one Vion day-fetch per job.
 *
 * Separate queue from event-report on purpose: a long fetch must never block a report,
 * and a stalled report must never requeue a fetch.
 */
import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import { redis } from '../config/redis';
import { eventFetchService } from '../services/eventFetch.service';
import { FETCH_TIMEOUT_MS, isEventV2Enabled } from '../services/vionRawdata.service';

const QUEUE_NAME = 'event-fetch';

const queueOpts: QueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,                                   // vendor hiccups are usually transient
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 200,
    removeOnFail: 200,
  },
};

const workerOpts: WorkerOptions = {
  connection: redis,
  concurrency: 1,                                  // one plaza at a time; the vendor is the bottleneck
  // ── Stall protection — same reasoning as eventReport.queue (lesson #71) ──
  // A fetch is mostly awaited I/O, but the ExcelJS row writes between pages are synchronous,
  // and the busiest site measured takes ~18 min of wall clock for one day. Give the lock twice
  // the whole job budget so BullMQ's renewal never races the work, and refuse to requeue a
  // stalled job: runFetch() has already written FAILED/COMPLETED to the DB itself, and a
  // requeue would re-pull hundreds of thousands of rows for nothing.
  lockDuration: Math.max(2 * 60 * 60 * 1000, FETCH_TIMEOUT_MS * 2),
  maxStalledCount: 0,
};

export interface EventFetchJob { runId: string; eventId: string; date: string }

export const eventFetchQueue = new Queue<EventFetchJob>(QUEUE_NAME, queueOpts);

let _worker: Worker<EventFetchJob> | null = null;

export function startEventFetchWorker() {
  if (_worker) return _worker;
  if (!isEventV2Enabled()) {
    console.log('[eventFetch] EVENT_V2_ENABLED is not true — worker not started');
    return null;
  }
  _worker = new Worker<EventFetchJob>(
    QUEUE_NAME,
    async (job) => {
      console.log(`[eventFetch] ${job.data.eventId} ${job.data.date} (attempt ${job.attemptsMade + 1})`);
      await eventFetchService.runFetch(job.data.runId, job.attemptsMade + 1);
    },
    workerOpts,
  );

  _worker.on('completed', (job) => {
    console.log(`[eventFetch] ✓ ${job.data.eventId} ${job.data.date}`);
  });
  _worker.on('failed', (job, err) => {
    console.error(`[eventFetch] ✗ ${job?.data.eventId} ${job?.data.date}: ${err.message}`);
  });

  console.log(`[eventFetch] worker started (lockDuration ${workerOpts.lockDuration}ms, timeout ${FETCH_TIMEOUT_MS}ms)`);
  return _worker;
}

export function stopEventFetchWorker() {
  return _worker?.close();
}

/** Queue one job per run row, oldest day first so the history table fills in order. */
export async function enqueueFetchRuns(runs: { id: string; eventId: string; date: string }[]) {
  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of sorted) {
    await eventFetchQueue.add(
      'fetch-day',
      { runId: r.id, eventId: r.eventId, date: r.date },
      // one job per run row; re-adding the same run is a no-op.
      // NOTE: BullMQ rejects ':' in a custom jobId ("Custom Id cannot contain :") — use '--'.
      { jobId: `event-fetch--${r.id}` },
    );
  }
  return sorted.length;
}
