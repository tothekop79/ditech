/**
 * eventFetch.service — Event Report v2: bookkeeping around vionRawdata.fetchDay().
 *
 * One EventFetchRun row per (event, day) attempt, so the UI can show history and the
 * schedule (Step 3) has somewhere to report into. The actual vendor call lives in
 * vionRawdata.service; this file only decides *which* days to fetch and records what happened.
 *
 * Nothing here is reachable from the UPLOAD path.
 */
import { PrismaClient, EventFetchStatus, EventFetchTrigger, Prisma } from '@prisma/client';
import type { EventDataSource, VionServerKey } from '@prisma/client';
import { fetchDay, probePlaza, siteLocalDay, eachDay } from './vionRawdata.service';
import type { VionSource } from '../integrations/vion/vion.client';

const prisma = new PrismaClient();

/** The vendor keeps roughly this many days of capture records per plaza (verified Step 0). */
export const VION_RETENTION_DAYS = 7;

/** Oldest site-local day still worth asking for. */
export function retentionFloor(): string {
  return siteLocalDay(-(VION_RETENTION_DAYS - 1));
}

export class EventNotVionError extends Error {}

interface VionEvent {
  id: string;
  name: string;
  dataSource: string;
  vionServer: VionSource | null;
  vionPlazaId: string | null;
  startDate: Date;
  endDate: Date;
}

/** A daily cron the UI can round-trip: "M H * * *". Anything else is rejected on save. */
export const DAILY_CRON = /^([0-5]?\d) ([01]?\d|2[0-3]) \* \* \*$/;

export function cronFromTime(hhmm: string): string {
  const m = hhmm.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) throw new EventNotVionError(`เวลาไม่ถูกต้อง: "${hhmm}" (ต้องเป็น HH:MM)`);
  return `${Number(m[2])} ${Number(m[1])} * * *`;
}

export function timeFromCron(cron: string): string | null {
  const m = cron.match(DAILY_CRON);
  return m ? `${String(m[2]).padStart(2, '0')}:${String(m[1]).padStart(2, '0')}` : null;
}

/** The last site-local day a schedule should still run: one day past the event, to catch D-1. */
export function scheduleLastDay(endDate: Date): string {
  return new Date(endDate.getTime() + 86_400_000).toISOString().slice(0, 10);
}

/** True while the event still has a day worth fetching. After this the repeatable job removes itself. */
export function scheduleStillActive(ev: { endDate: Date }, today = siteLocalDay(0)): boolean {
  return today <= scheduleLastDay(ev.endDate);
}

async function loadVionEvent(eventId: string): Promise<VionEvent> {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, name: true, dataSource: true, vionServer: true, vionPlazaId: true,
      startDate: true, endDate: true,
    },
  });
  if (!ev) throw new EventNotVionError(`Event ${eventId} not found`);
  if (ev.dataSource !== 'VION') {
    throw new EventNotVionError(`Event "${ev.name}" uses dataSource=${ev.dataSource}; set it to VION first`);
  }
  if (!ev.vionServer || !ev.vionPlazaId) {
    throw new EventNotVionError(`Event "${ev.name}" is missing vionServer / vionPlazaId`);
  }
  return ev as VionEvent;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Days worth fetching for an event, newest-relevant first:
 * the event's own date range, clipped to what the vendor still has and to days that have begun.
 */
export function plannedDates(ev: { startDate: Date; endDate: Date }): string[] {
  const today = siteLocalDay(0);
  const floor = retentionFloor();
  const from = ymd(ev.startDate) < floor ? floor : ymd(ev.startDate);
  const to = ymd(ev.endDate) > today ? today : ymd(ev.endDate);
  if (from > to) return [];
  return eachDay(from, to);
}

export const eventFetchService = {
  VION_RETENTION_DAYS,
  retentionFloor,
  plannedDates,

  async probe(eventId: string) {
    const ev = await loadVionEvent(eventId);
    const result = await probePlaza({ server: ev.vionServer!, plazaId: ev.vionPlazaId! });
    return { ...result, retentionFloor: retentionFloor(), retentionDays: VION_RETENTION_DAYS };
  },

  /** Create QUEUED rows for the given days (or the event's planned range) and return them. */
  async createRuns(
    eventId: string,
    opts: { dates?: string[]; force?: boolean; triggeredBy?: EventFetchTrigger; triggeredById?: string | null } = {},
  ) {
    const ev = await loadVionEvent(eventId);
    const dates = (opts.dates?.length ? opts.dates : plannedDates(ev))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (dates.length === 0) {
      throw new EventNotVionError(
        `No days to fetch — the event range has no day inside the vendor's ${VION_RETENTION_DAYS}-day ` +
        `retention window (oldest available: ${retentionFloor()})`,
      );
    }

    const runs = [];
    for (const date of dates) {
      runs.push(await prisma.eventFetchRun.create({
        data: {
          eventId,
          date,
          status: EventFetchStatus.QUEUED,
          force: opts.force ?? false,
          triggeredBy: opts.triggeredBy ?? EventFetchTrigger.MANUAL,
          triggeredById: opts.triggeredById ?? null,
        },
      }));
    }
    return runs;
  },

  /** Execute one run. Called by the worker; never throws for vendor errors — it records them. */
  async runFetch(runId: string, attempt = 1): Promise<void> {
    const run = await prisma.eventFetchRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error(`EventFetchRun ${runId} not found`);

    const ev = await loadVionEvent(run.eventId);

    await prisma.eventFetchRun.update({
      where: { id: runId },
      data: { status: EventFetchStatus.RUNNING, startedAt: new Date(), attempt },
    });

    try {
      const r = await fetchDay({
        eventId: ev.id,
        server: ev.vionServer!,
        plazaId: ev.vionPlazaId!,
        date: run.date,
        force: run.force,
      });
      if (r.empty) {
        console.log(`[eventFetch] ${ev.name} ${run.date}: vendor has no rows — no file written`);
      }
      await prisma.eventFetchRun.update({
        where: { id: runId },
        data: {
          status: r.skipped ? EventFetchStatus.SKIPPED : EventFetchStatus.COMPLETED,
          // a skipped day wrote nothing; leaving these null keeps the UI from reading "0 rows"
          rows: r.skipped ? null : r.rows,
          fullDayRows: r.skipped ? null : r.fullDayRows,
          reportedTotal: r.skipped ? null : r.reportedTotal,
          durationMs: r.durationMs,
          finishedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (err: any) {
      await prisma.eventFetchRun.update({
        where: { id: runId },
        data: {
          status: EventFetchStatus.FAILED,
          errorMessage: String(err?.message ?? err).slice(0, 2000),
          finishedAt: new Date(),
        },
      });
      throw err;                      // let BullMQ count the attempt and back off
    }
  },

  /**
   * The days one scheduled tick should pull.
   *   D-1 and D-2 are always re-pulled (force) — the vendor keeps writing ReID rows into a day
   *   for a while after it closes, so yesterday's file is not final when we first take it.
   *   Older days are filled in only if their file is missing.
   */
  scheduledDates(ev: { startDate: Date; endDate: Date }, today = siteLocalDay(0)) {
    const planned = plannedDates(ev);
    const set = new Set(planned);
    const force = [siteLocalDay(-1), siteLocalDay(-2)].filter((d) => set.has(d));
    const backfill = planned.filter((d) => !force.includes(d) && d <= today);
    return { force, backfill };
  },

  /**
   * One scheduled tick: pull what is due, then hand the report queue the result.
   * Runs the fetches inline rather than fanning out, so "all days done → generate" needs no
   * cross-job coordination. The queue's lockDuration is sized for exactly this (lesson #71).
   */
  async runScheduledFetch(eventId: string): Promise<{ ran: string[]; generated: boolean; stopped: boolean }> {
    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, name: true, dataSource: true, vionServer: true, vionPlazaId: true,
        startDate: true, endDate: true, fetchSchedule: true, autoGenerate: true,
      },
    });

    // The event may have been deleted, switched back to UPLOAD, had its schedule cleared, or
    // simply finished. In every one of those cases the repeatable job should stop existing.
    if (!ev || ev.dataSource !== 'VION' || !ev.fetchSchedule || !ev.vionServer || !ev.vionPlazaId) {
      return { ran: [], generated: false, stopped: true };
    }
    if (!scheduleStillActive(ev)) {
      console.log(`[eventFetch] ${ev.name}: past endDate+1, schedule retiring`);
      return { ran: [], generated: false, stopped: true };
    }

    const { force, backfill } = eventFetchService.scheduledDates(ev);
    const plan: { date: string; force: boolean }[] = [
      ...force.map((date) => ({ date, force: true })),
      ...backfill.map((date) => ({ date, force: false })),
    ];

    const ran: string[] = [];
    for (const { date, force: f } of plan) {
      const run = await prisma.eventFetchRun.create({
        data: {
          eventId, date, status: EventFetchStatus.QUEUED, force: f,
          triggeredBy: EventFetchTrigger.SCHEDULE,
        },
      });
      try {
        await eventFetchService.runFetch(run.id);
        const after = await prisma.eventFetchRun.findUnique({ where: { id: run.id }, select: { rows: true } });
        // an empty or skipped day changes no file, so it is not a reason to regenerate
        if ((after?.rows ?? 0) > 0) ran.push(date);
      } catch (err: any) {
        // runFetch already recorded FAILED; one bad day must not abort the rest of the tick
        console.error(`[eventFetch] scheduled ${eventId} ${date} failed: ${err?.message ?? err}`);
      }
    }

    let generated = false;
    if (ev.autoGenerate && ran.length > 0) {
      // imported lazily: eventReport.service pulls in the engine spawner and the queue
      const { eventReportService } = await import('./eventReport.service');
      await eventReportService.enqueueReport(eventId, null);
      generated = true;
    }

    return { ran, generated, stopped: false };
  },

  /**
   * The single write path for the v2 config. PATCH /api/events/:id still accepts the three
   * data-source fields, but the UI comes here because only this path validates the schedule,
   * re-syncs the repeatable job and kicks off the first backfill.
   */
  async saveConfig(
    eventId: string,
    input: {
      dataSource: EventDataSource;
      vionServer?: VionServerKey | null;
      vionPlazaId?: string | null;
      fetchSchedule?: string | null;
      fetchTz?: string | null;
      autoGenerate?: boolean;
      autoSendRuleId?: string | null;
    },
    triggeredById?: string | null,
  ) {
    const before = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, dataSource: true, fetchSchedule: true, startDate: true, endDate: true },
    });
    if (!before) throw new EventNotVionError(`Event ${eventId} not found`);

    const isVion = input.dataSource === 'VION';
    if (isVion) {
      if (!input.vionServer) throw new EventNotVionError('เลือก server (Mall หรือ Retail) ก่อน');
      if (!input.vionPlazaId?.trim()) throw new EventNotVionError('กรอก Plaza ID ก่อน');
      // The vendor only keeps ~7 days, so an event without a schedule silently loses data.
      // Refusing to save is the only way to make that impossible rather than merely unlikely.
      if (!input.fetchSchedule?.trim()) {
        throw new EventNotVionError(
          `ต้องตั้งเวลาดึงอัตโนมัติก่อนบันทึก — Vion เก็บข้อมูลย้อนหลังแค่ ${VION_RETENTION_DAYS} วัน ` +
          'ถ้าไม่ตั้งเวลา ข้อมูลของวันที่เลยหน้าต่างนี้จะหายถาวร',
        );
      }
      if (!DAILY_CRON.test(input.fetchSchedule.trim())) {
        throw new EventNotVionError(`ตารางเวลาไม่ถูกต้อง: "${input.fetchSchedule}" (รองรับแบบรายวัน "M H * * *")`);
      }
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        dataSource: input.dataSource,
        vionServer: isVion ? input.vionServer! : null,
        vionPlazaId: isVion ? input.vionPlazaId!.trim() : null,
        fetchSchedule: isVion ? input.fetchSchedule!.trim() : null,
        fetchTz: input.fetchTz?.trim() || 'Asia/Bangkok',
        autoGenerate: input.autoGenerate ?? true,
        autoSendRuleId: isVion ? (input.autoSendRuleId || null) : null,
      },
    });

    // imported lazily so this service stays usable from scripts that have no Redis
    const { syncEventRepeatable } = await import('../queues/eventFetch.queue');
    await syncEventRepeatable(updated.id);

    // First time this event becomes a VION source: pull everything the vendor still has,
    // rather than making the user wait for tonight's tick.
    let backfillRuns: { id: string; eventId: string; date: string }[] = [];
    const becameVion = isVion && before.dataSource !== 'VION';
    if (becameVion) {
      try {
        backfillRuns = await eventFetchService.createRuns(eventId, { triggeredById });
        const { enqueueFetchRuns } = await import('../queues/eventFetch.queue');
        await enqueueFetchRuns(backfillRuns);
      } catch (err: any) {
        // An event entirely outside the retention window is a legitimate state, not a save failure
        console.warn(`[eventFetch] no initial backfill for ${eventId}: ${err?.message ?? err}`);
      }
    }

    return { event: updated, backfillQueued: backfillRuns.length };
  },

  async listRuns(eventId: string, limit = 60) {
    return prisma.eventFetchRun.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
  },

  /** Dates that currently have a COMPLETED fetch — drives the API/Upload badge in the UI. */
  async apiDates(eventId: string): Promise<string[]> {
    const rows = await prisma.eventFetchRun.findMany({
      where: { eventId, status: { in: [EventFetchStatus.COMPLETED, EventFetchStatus.SKIPPED] } },
      select: { date: true },
      distinct: ['date'],
    });
    return rows.map((r) => r.date).sort();
  },
};

export type EventFetchRunRow = Prisma.EventFetchRunGetPayload<Record<string, never>>;
