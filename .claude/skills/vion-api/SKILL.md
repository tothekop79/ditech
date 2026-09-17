---
name: vion-api
description: Pull footfall, dwell-time, demographics, heatmap, ReID/capture or camera/device data from the two VION cloud servers (Vion, vionyun, vion-cloud, retail.vionyun.com, mall.vion-cloud.com) — plazaInfo, gateInfo, zoneInfo, device, gateHour, gateDay, plazaHour, plazaDay, captureRecord, mallDwellTime, zoneDwellTime, plazaResidence, heatMap, zoneHourStat, queue. Use for any VION API call, any "ดึงข้อมูลกล้อง / ข้อมูลคนเข้าห้าง / ยอดคนเดินผ่าน" request, and for counting-data pulls for King Power, Panpuri, DO HOME, Robinson/Central, Makro, Samsung or any other VION customer or site.
---

# VION OpenAPI

Two vendor servers, one login recipe, a lot of undocumented behaviour. Everything here was verified live —
see `docs/VION_API_VERIFIED.md` for the evidence and `docs/vion-probe-results.json` for the raw probe output.

| | Base URL | What lives there |
|---|---|---|
| **Mall** | `$VION_MALL_BASE_URL` (`mall.vion-cloud.com:18080`) | the airport/mall accounts — SVB, SAT 1, Rang Nam, Ratchaphruek. Floors, mall entrances, in-mall stores, per-person residence records. |
| **Retail** | `$VION_RETAIL_BASE_URL` (`retail.vionyun.com:18085`) | the ~216 standalone shops — Central World, Makro, One Nimman, Icon Siam tenants… Zones, heatmaps, passer-by / entry-rate metrics, queues. |

Credentials are already in the backend container env: `VION_{MALL,RETAIL}_{BASE_URL,APPKEY,USERNAME,PASSWORD}`.

## The twelve things to know

1. **Two APIs.** `/api/v2/**` is camelCase with envelope `{code, success, message, data}`. `/api/v1/**` is
   **snake_case** (`plaza_unid`) with envelope `{msg_code, msg_info, data}`, wants a **plain-text** password at
   login, and **exists only on Mall**.
2. **Retail answers every `/api/v1/*` path** with `msg_code:501 "atoken verification failed"`, existing or not.
   That is the auth gate, not a 404 — never read it as "the endpoint is there".
3. **Auth.** `POST /api/v2/user/login` `{appkey, username, password: base64(AES-ECB(appkey, password))}` →
   `{code:200, data:{atoken}}`, then header `Authorization: <atoken>` — no `Bearer`. Failures come back as
   **HTTP 200** with `code:"-1"`/`"501"`, so branch on `code`, never on the HTTP status.
4. **Paths are case-sensitive and the vendor PDFs mis-case them.** `plazainfo` 404s, `plazaInfo` works.
5. **Most "daily" endpoints take a single `countdate=YYYY-MM-DD`**, not the documented `startDate`/`endDate`
   (which are then ignored). There is **no range query anywhere** — loop days client-side.
6. **Hourly endpoints take `startTime`/`endTime` (`YYYY-MM-DD HH:mm:ss`) inside one site-local day.**
7. **`modifyTime` replaces the window as an incremental cursor** and returns rows across day boundaries.
   Use it for sync, never for "traffic on day X".
8. **Timezones are per field.** `countdate` / `counttime` / `counttimeLocal` / `intime` / `outtime` are
   site-local; `modifyTime` is vendor server time **GMT+8**.
9. **A zone is called a "store" in half the API** — `zoneGateInfo` and `storeCountingData*` want the zone id
   as `storeUnid`.
10. **`plazaName` is not unique** (six "Central World"). Key everything on `plazaUnid`.
11. **`gateUnid` is optional, and a wrong one is silently ignored.** Omit it to get every gate of a site
    in one call — the cheap way to pull a whole site. But a typo'd gate id returns site-wide totals with no
    error, so always check the `gateUnid` on the rows you got back. `zoneUnid` and `plazaUnid` are validated
    properly.
12. **Paging is `page`, not the documented `pageNum`.** `pageNum` is accepted, ignored, and answers page 1
    every time — loop on it and you collect the same 1000 rows forever. Only `captureRecord` pages at all;
    the v1 residence endpoints hand back the entire day (23k rows) in one response.

## Workflow

1. **Pick the server.** Mall for SVB / SAT 1 / Rang Nam / Ratchaphruek; Retail for everything else. If you
   don't know, look the site up in the `MonitoredSite` table (`source` column) — see `reference/ids.md`.
2. **Resolve ids** — `plazaInfo` → `plazaUnid`, then `gateInfo` / `zoneInfo` / `floorInfo` for the child ids.
   Never hard-code a unid into a file; fetch it. `reference/ids.md` has the recipes.
3. **Call with a same-day window**, one day per call, using the param set in `reference/endpoints.md`.
   For a date range, loop days client-side and concatenate.
4. **Parse timezones per field** (rule 8). Do not assume one zone for a whole row.
5. **Be gentle**: sequential calls ≥300 ms apart, 20 s timeout. Never sweep all 221 sites without being
   asked — resolve the specific site first. `captureRecord` / `plazaResidence` return tens of thousands of
   rows per site-day; page them and cap what you pull.
6. **Never persist secrets.** Don't write appkey, password or `atoken` into a file, log, commit or chat —
   print at most the first 6 chars of a token.
7. **In application code use `backend/src/integrations/vion/vion.client.ts`** (token cache, re-auth on
   `code:"-1"`). The CLI below is for ad-hoc pulls and exploration only.

## The CLI

The CLI lives at **`backend/scripts/vion.ts`** and the **only** runnable form is inside the backend
container — the host has no node, and the Vion credentials exist only in the container env:

```bash
docker exec ditech-planner-backend-1 npx tsx scripts/vion.ts list
docker exec ditech-planner-backend-1 npx tsx scripts/vion.ts <mall|retail> <endpoint|/raw/path> [options]
```

(The container's working directory is `/app` = `backend/`, which is why the path is `scripts/vion.ts`.)
`scripts/vion.ts` in this skill folder is only a pointer — there is no second copy to run or keep in sync.

| Option | Effect |
|---|---|
| `--plazaUnid= --gateUnid= --zoneUnid= --floorUnid=` | ids (aliased to `storeUnid` / snake_case automatically) |
| `--day=YYYY-MM-DD` | one site-local day; defaults to yesterday |
| `--from= --to=` | date range — hourly endpoints are looped one day at a time |
| `--modifyTime="… …"` | incremental cursor instead of a window |
| `--page= --size= --all-pages` | paging (`page`/`pageSize`); stops on the envelope's `pages` |
| `--max-pages=N` | safety cap for `--all-pages` (default 200) |
| `--json` / `--table` / `--limit=N` | output (default: table, first 20 rows) |
| `--out=file.csv\|.json` | write the full result (CSV is UTF-8 BOM, Excel-safe) |

Exits non-zero and prints the vendor message on `code≠200`.

```bash
# yesterday's hourly footfall for one entrance, as CSV
docker exec ditech-planner-backend-1 npx tsx scripts/vion.ts retail gateHour \
  --plazaUnid=<unid> --gateUnid=<unid> --day=2026-09-16 --out=/app/uploads/gate.csv
```

## Guardrails

- **Read-only.** Every endpoint here is a GET; the only POST is login. There is no documented write API —
  if a task seems to need one, stop and ask.
- Stay inside the rate etiquette in step 5 even when a task looks urgent.
- Re-verify rather than trust: the vendor changes behaviour silently. `backend/scripts/vion-probe.ts`
  re-runs the whole catalog against both servers in ~4 minutes and rewrites the evidence file.

## Reference

- `backend/scripts/vion.ts` — the CLI itself (run it via `docker exec`, as above).
- `backend/scripts/vion-probe.ts` — re-verifies the whole catalog against both servers.
- `reference/endpoints.md` — the verified catalog: path, params, rows, per-server availability.
- `reference/ids.md` — resolving plaza → floor / gate / zone, and site → customer.
- `docs/VION_API_VERIFIED.md` — the long form, including every response field and the docs-vs-reality list.
