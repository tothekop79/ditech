#!/usr/bin/env npx tsx
/**
 * vion-fetch-day.ts — pull one day (or a range) of Vion capture records into an event's source/ folder.
 *
 *   docker exec ditech-planner-backend-1 npx tsx scripts/vion-fetch-day.ts \
 *     --event <eventId> --date 2026-09-15 [--force]
 *   docker exec ditech-planner-backend-1 npx tsx scripts/vion-fetch-day.ts \
 *     --event <eventId> --from 2026-09-10 --to 2026-09-16 [--force]
 *
 * Server + plaza come from the Event row (dataSource/vionServer/vionPlazaId), or can be
 * overridden with --server mall|retail --plaza <plazaUnid> for a dry run against any site.
 *
 * Read-only against the vendor. Writes only into uploads/events/<id>/source/.
 */
import { PrismaClient } from '@prisma/client';
import {
  fetchDay, probePlaza, eachDay, FETCH_TIMEOUT_MS,
} from '../src/services/vionRawdata.service';
import type { VionSource } from '../src/integrations/vion/vion.client';

const prisma = new PrismaClient();

/** Accepts both `--key=value` and `--key value`; a flag with no value becomes "true". */
function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    if (m[2] !== undefined) { flags[m[1]] = m[2]; continue; }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { flags[m[1]] = next; i++; }
    else flags[m[1]] = 'true';
  }
  return flags;
}

function usage(msg?: string): never {
  if (msg) console.error(`\n✗ ${msg}`);
  console.error(`
usage: vion-fetch-day.ts --event <eventId> (--date YYYY-MM-DD | --from YYYY-MM-DD --to YYYY-MM-DD)
                         [--force] [--probe] [--server mall|retail] [--plaza <plazaUnid>]

  --event    event whose source/ folder receives the files (required)
  --date     one site-local day
  --from/--to  inclusive range; the vendor only retains ~7 days
  --force    overwrite a day that already has a file (default: skip it)
  --probe    just print plaza name / cameras / gates / retention and exit
  --server   override the event's vionServer
  --plaza    override the event's vionPlazaId
`);
  process.exit(msg ? 1 : 0);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) usage();

  const eventId = flags.event;
  if (!eventId) usage('--event is required');

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, dataSource: true, vionServer: true, vionPlazaId: true },
  });
  if (!event) usage(`event ${eventId} not found`);

  const server = (flags.server ? flags.server.toUpperCase() : event.vionServer) as VionSource | null;
  const plazaId = flags.plaza ?? event.vionPlazaId;
  if (!server) usage('no server — set Event.vionServer or pass --server mall|retail');
  if (!plazaId) usage('no plaza — set Event.vionPlazaId or pass --plaza <plazaUnid>');
  if (server !== 'MALL' && server !== 'RETAIL') usage(`--server must be mall or retail, got "${server}"`);

  console.error(`# event ${event.name} (${event.id})  dataSource=${event.dataSource}`);
  console.error(`# ${server} plaza ${plazaId}`);

  if (flags.probe) {
    const p = await probePlaza({ server, plazaId });
    console.log(JSON.stringify(p, null, 2));
    return;
  }

  let days: string[];
  if (flags.from) days = eachDay(flags.from, flags.to ?? flags.from);
  else if (flags.date) days = [flags.date];
  else return usage('pass --date or --from/--to');

  const force = flags.force === 'true';
  console.error(`# ${days.length} day(s), force=${force}, timeout=${FETCH_TIMEOUT_MS}ms per day\n`);

  let failures = 0;
  for (const date of days) {
    const t0 = Date.now();
    try {
      const r = await fetchDay({ eventId: event.id, server, plazaId, date, force });
      if (r.skipped) {
        console.log(`${date}  SKIP   file already exists (use --force to overwrite)`);
      } else {
        const w = r.warnings;
        const warn = w.unknownGender + w.unknownDirection + w.unknownPersonType + w.unresolvedLocation;
        console.log(
          `${date}  OK     ${String(r.rows).padStart(7)} rows  ` +
          `(vendor ${r.reportedTotal}, ${r.clippedOutOfHours} outside ${r.hoursStart}:00-${r.hoursEnd}:00, ` +
          `${r.fullDayRows} in _fullday)  ` +
          `${(r.durationMs / 1000).toFixed(1)}s` +
          (warn ? `  ⚠ ${warn} unmapped` : '') +
          (r.duplicatesDropped ? `  ⚠ ${r.duplicatesDropped} dup dropped` : ''),
        );
      }
    } catch (err: any) {
      failures++;
      console.log(`${date}  FAIL   ${err?.message ?? err}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }

  if (failures) { console.error(`\n${failures}/${days.length} day(s) failed`); process.exit(1); }
}

main()
  .catch((e) => { console.error(String(e?.stack ?? e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
