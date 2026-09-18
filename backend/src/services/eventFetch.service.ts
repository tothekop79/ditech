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
