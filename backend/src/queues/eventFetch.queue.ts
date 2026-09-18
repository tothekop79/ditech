/**
 * eventFetch.queue — Event Report v2: one Vion day-fetch per job.
 *
 * Separate queue from event-report on purpose: a long fetch must never block a report,
 * and a stalled report must never requeue a fetch.
 */
import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redis } from '../config/redis';
import { eventFetchService, scheduleStillActive } from '../services/eventFetch.service';
import { FETCH_TIMEOUT_MS, isEventV2Enabled } from '../services/vionRawdata.service';

const prisma = new PrismaClient();

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

/** `fetch-day` carries a run row; `scheduled-fetch` is the repeatable tick and knows only the event. */
export interface EventFetchJob { runId?: string; eventId: string; date?: string }

const JOB_FETCH_DAY = 'fetch-day';
const JOB_SCHEDULED = 'scheduled-fetch';

/** BullMQ rejects ':' in a custom/repeatable job id — use '--'. */
export const repeatableJobId = (eventId: string) => `event-fetch--${eventId}`;

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
      if (job.name === JOB_SCHEDULED) {
        console.log(`[eventFetch] scheduled tick for ${job.data.eventId}`);
        const r = await eventFetchService.runScheduledFetch(job.data.eventId);
        if (r.stopped) {
          // the event finished, went back to UPLOAD, lost its schedule or was deleted
          await removeEventRepeatable(job.data.eventId);
          console.log(`[eventFetch] repeatable removed for ${job.data.eventId}`);
        } else {
          console.log(`[eventFetch] scheduled ${job.data.eventId}: ${r.ran.length} day(s), report=${r.generated}`);
        }
        return;
      }
      if (!job.data.runId) throw new Error(`job ${job.id} has no runId`);
      console.log(`[eventFetch] ${job.data.eventId} ${job.data.date} (attempt ${job.attemptsMade + 1})`);
      await eventFetchService.runFetch(job.data.runId, job.attemptsMade + 1);
    },
    workerOpts,
  );

  _worker.on('completed', (job) => {
    console.log(`[eventFetch] ✓ ${job.data.eventId} ${job.data.date ?? job.name}`);
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
      JOB_FETCH_DAY,
      { runId: r.id, eventId: r.eventId, date: r.date },
      // one job per run row; re-adding the same run is a no-op.
      // NOTE: BullMQ rejects ':' in a custom jobId ("Custom Id cannot contain :") — use '--'.
      { jobId: `event-fetch--${r.id}` },
    );
  }
  return sorted.length;
}

// ──────────────────────────────────────────────────────────────────
// Repeatable jobs — one per scheduled event
// ──────────────────────────────────────────────────────────────────

/**
 * Drop this event's schedule.
 *
 * NOTE: getRepeatableJobs() does NOT echo back a custom jobId — its `key` is an opaque hash —
 * so a repeatable cannot be found by the id it was added with. BullMQ 5's Job Scheduler API
 * does key on an id we choose, so everything here goes through that instead.
 */
export async function removeEventRepeatable(eventId: string): Promise<boolean> {
  return eventFetchQueue.removeJobScheduler(repeatableJobId(eventId));
}

/**
 * Make the queue match the DB for one event: exactly one scheduler while the event is a
 * scheduled VION source that has not finished, and none otherwise.
 * upsertJobScheduler replaces an existing pattern in place, so changing the time cannot
 * leave the old one firing.
 */
export async function syncEventRepeatable(eventId: string): Promise<'added' | 'removed' | 'skipped'> {
  if (!isEventV2Enabled()) return 'skipped';

  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, dataSource: true, fetchSchedule: true, fetchTz: true, endDate: true },
  });

  if (!ev || ev.dataSource !== 'VION' || !ev.fetchSchedule || !scheduleStillActive(ev)) {
    await removeEventRepeatable(eventId);
    return 'removed';
  }

  await eventFetchQueue.upsertJobScheduler(
    repeatableJobId(eventId),
    // BullMQ 5 takes `pattern` + `tz`; `cron` is the v3 spelling and is ignored here.
    { pattern: ev.fetchSchedule, tz: ev.fetchTz || 'Asia/Bangkok' },
    { name: JOB_SCHEDULED, data: { eventId }, opts: { removeOnComplete: 50, removeOnFail: 50 } },
  );
  return 'added';
}

/**
 * Boot-time reconciliation: add what the DB says should exist, drop everything else.
 * Called from server.ts; a no-op unless EVENT_V2_ENABLED=true.
 */
export async function syncAllRepeatables(): Promise<{ added: number; removed: number }> {
  if (!isEventV2Enabled()) {
    // Off means inert, not dormant: tear down anything a previous run left in Redis, so no
    // delayed job is sitting there waiting for a worker. The DB keeps the schedules, and
    // turning the flag back on re-creates them from it on the next boot.
    let removed = 0;
    for (const sched of await eventFetchQueue.getJobSchedulers()) {
      if (sched.key) { await eventFetchQueue.removeJobScheduler(sched.key); removed++; }
    }
    console.log(`[eventFetch] EVENT_V2_ENABLED is not true — ${removed} repeatable(s) removed, none synced`);
    return { added: 0, removed };
  }

  const events = await prisma.event.findMany({
    where: { dataSource: 'VION', fetchSchedule: { not: null } },
    select: { id: true, name: true, endDate: true, fetchSchedule: true, fetchTz: true, dataSource: true },
  });
  const active = events.filter((e) => scheduleStillActive(e));
  const wanted = new Set(active.map((e) => repeatableJobId(e.id)));

  // drop strays first: events deleted, finished, or switched back to UPLOAD while we were down
  let removed = 0;
  for (const sched of await eventFetchQueue.getJobSchedulers()) {
    if (sched.key && !wanted.has(sched.key)) {
      await eventFetchQueue.removeJobScheduler(sched.key);
      removed++;
    }
  }

  let added = 0;
  for (const e of active) {
    if ((await syncEventRepeatable(e.id)) === 'added') added++;
  }

  console.log(`[eventFetch] repeatables synced: ${added} active, ${removed} stale removed`);
  return { added, removed };
}
