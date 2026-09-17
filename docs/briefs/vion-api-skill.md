# Brief — Probe every Vion OpenAPI endpoint on both servers and build a `vion-api` skill

## Goal
1. Systematically call **every** endpoint documented for the two Vion servers, with real ids, and record what
   actually works: exact path (case!), auth, params, response envelope, field names, quirks, timezone semantics.
2. Turn the verified results into a reusable Claude Code skill at `.claude/skills/vion-api/` so any future task
   ("pull dwell time for Panpuri last week", "which gates does site X have") can be done without re-discovery.
3. A small CLI (`backend/scripts/vion.ts`) that the skill and humans can use: `vion <server> <endpoint> [--param=value]`.

## Hard rules
- **Read-only.** Every Vion endpoint is GET or a login POST. Never call anything that creates/updates/deletes. If a
  documented endpoint looks like a write, record it as "not probed (write)" and skip.
- **Be gentle.** Sequential calls, ≥300 ms apart, timeouts 20 s, one sample per endpoint per server (plus at most
  2 retries for casing/version variants). No loops over all 221 sites. Same-day windows only (vendor constraint).
- **Redact.** Never write appkey, password, or `atoken` into any file, log, or commit. Print tokens as first 6 chars.
- **Do not touch** backend/src/services, routes, prisma, docker-compose, .env. Only create: `backend/scripts/vion.ts`,
  `backend/scripts/vion-probe.ts`, `.claude/skills/vion-api/**`, `docs/VION_API_VERIFIED.md`. Commit nothing; show git status.
- Run scripts inside the backend container (host has no node): `docker exec ditech-planner-backend-1 npx tsx scripts/vion.ts …`
  (cwd in container is /app = backend/). Credentials are already in the container env as
  `VION_MALL_BASE_URL/APPKEY/USERNAME/PASSWORD` and `VION_RETAIL_*`.

## Reuse what exists — read first
- `backend/src/integrations/vion/vion.client.ts` — login (AES-ECB(appkey)+base64), token cache, `get()` with re-auth,
  `listPlazas`, `listDevices`, `gateHour`, `listGroups`. Import it; do not duplicate the AES code.
- `docs/PROJECT_STATE.md` → section "📷 Camera Monitor module" → "Vion API facts" for what's already verified.

## Verified facts (don't re-derive)
- Both servers: `POST /api/v2/user/login` → `{code:200, data:{atoken}}`. Mall also accepts `/api/v1/user/login` plain.
- Header `Authorization: <atoken>` (no Bearer). Auth failure is HTTP 200 + `code:"-1"` / `"501"` with a message.
- Paths are case-sensitive and the PDFs mis-case several (`plazainfo` → `plazaInfo`). Try, in order:
  documented path → camelCase of it → `/api/v1/` variant. Record which one answered.
- `startTime`/`endTime` must be the same local day. `modifyTime` fields are vendor server time **GMT+8**;
  `counttimeLocal`/`countdate` are site-local.
- Mall server returns 404 for `groupInfo`; Retail has it.
- Good sample ids: Retail plaza `a1252a62-…` (Shin Ramyun) has zones; Retail `edac2de4-…` (Makro, 5 devices);
  Mall plaza `55b7aac2-…` (SVB, 140 devices, gates). Get exact unids from `/api/v2/base/plazaInfo` at runtime —
  pick the first plaza that has ≥1 device AND ≥1 gate (Mall) / ≥1 zone (Retail) for data endpoints.

## Endpoint catalog to probe (from the vendor PDFs; paths as documented — expect casing/version errors)

### Mall server (`VION_MALL_BASE_URL`)
| # | Name | Documented path | Params (documented) |
|---|---|---|---|
| 1 | Login | `api/v1/user/login` (v2 also works) | appkey, username, password |
| 2 | Mall Info List | `api/v2/base/plazainfo` | — |
| 3 | Mall-Entrance Info List | `api/v2/base/gateinfo` | plazaUnid |
| 4 | Floor Info List | `api/v2/base/floorinfo` | plazaUnid |
| 5 | Floor-Entrance Info List | `api/v2/base/floorGateinfo` | floorUnid |
| 6 | Store Info List | `api/v2/base/zoneinfo` | plazaUnid |
| 7 | Mall Counting Data Hourly | `api/v2/reid/mallCountingDataHourly` | plazaUnid, startTime, endTime |
| 8 | Mall Counting Data Daily | `api/v2/reid/mallCountingDataDaily` | plazaUnid, startDate, endDate |
| 9 | Floor Counting Data Hourly | `api/v2/reid/floorCountingDataHourly` | plazaUnid, floorUnid, startTime, endTime |
| 10 | Floor Counting Data Daily | `api/v2/reid/floorCountingDataDaily` | plazaUnid, floorUnid, startDate, endDate |
| 11 | Mall Entrance Counting Hourly | `api/v2/reid/mallEntranceCountingDataHourly` | plazaUnid, gateUnid, startTime, endTime |
| 12 | Mall Entrance Counting Daily | `api/v2/reid/mallEntranceCountingDataDaily` | plazaUnid, gateUnid, startDate, endDate |
| 13 | Floor Entrance Counting Hourly | `api/v2/reid/floorEntranceCountingDataHourly` | plazaUnid, floorUnid, gateUnid, startTime, endTime |
| 14 | Floor Entrance Counting Daily | `api/v2/reid/floorEntranceCountingDataDaily` | … startDate, endDate |
| 15 | Store Counting Data Hourly | `api/v2/reid/storeCountingDataHourly` | plazaUnid, zoneUnid, startTime, endTime |
| 16 | Store Counting Data Daily | `api/v2/reid/storeCountingDataDaily` | plazaUnid, zoneUnid, startDate, endDate |
| 17 | Store DwellTime (Every Customer) | `api/v1/residence/plazaResidence` | plazaUnid, countdate (+paging?) |
| 18 | Device Info | `/api/v1/base/device` (v2 verified: `/api/v2/base/device?plazaUnid=`) | plazaUnid |
| 19 | Store-Entrance Counting Hourly | `api/v1/passenger/gateHour` (v2 verified) | plazaUnid, gateUnid, startTime, endTime |
| 20 | Store-Entrance Info List | `api/v2/base/zoneGateInfo` | zoneUnid |
| 21 | Store DwellTime | `api/v2/reid/zoneDwellTime` | plazaUnid, zoneUnid, startTime, endTime |
| 22 | Store DwellTime (Every Customer) | `api/v1/residence/zoneResidence` | plazaUnid, zoneUnid, countdate |
| 23 | Entrance Counting (Ten Minutes) | `api/v2/passenger/gateTenMins` | plazaUnid, gateUnid, startTime, endTime |
| 24 | Capture record | `api/v2/captureRecord` | plazaUnid, countdate, pageNum, pageSize (1000) |

### Retail server (`VION_RETAIL_BASE_URL`)
| # | Name | Documented path | Params |
|---|---|---|---|
| 1 | Login | `/api/v2/user/login` | appkey, username, password(AES) |
| 2 | Store Info List | `api/v2/base/plazaInfo` (verified) | — |
| 3 | Store-Entrance Info List | `api/v2/base/gateinfo` | plazaUnid |
| 4/5 | Store Counting / Hourly Customer Segment | `api/v2/reid/plazaHour` | plazaUnid, startTime, endTime **or** modifyTime |
| 6 | Store DwellTime | `api/v2/reid/mallDwellTime` | plazaUnid, startTime, endTime |
| 7 | Store DwellTime (Every Customer) | `api/v1/residence/plazaResidence` | plazaUnid, countdate |
| 8/9 | Store-Entrance Hourly Segment / ReID record | `api/v2/captureRecord` | plazaUnid, countdate, pageNum, pageSize |
| 10/11 | In-store area / Store Daily Customer Segment (V2) | `api/v2/passenger/plazaDay` | plazaUnid, startDate, endDate / modifyTime |
| 12 | Entrance Daily Demographics (V2) | `/api/v2/reid/gateDay` | plazaUnid, gateUnid, startDate, endDate / modifyTime |
| 13 | Entrance Hourly Demographics (V2) | `/api/v2/reid/gateHour` | plazaUnid, gateUnid, startTime, endTime / modifyTime |
| 14 | Heatmap | `/api/v2/heatMap` | plazaUnid, (date/hour?) |
| 15 | Entrance Visitor Flow | `/api/v2/gateFlowDirection` | plazaUnid, gateUnid, startTime, endTime |
| 16 | Store zone data | `/api/v2/zoneStat` | plazaUnid, zoneUnid, startDate, endDate |
| 17 | Zone info | `/api/v2/base/zoneInfo` | plazaUnid |
| 18 | Store zone hourly data | `/api/v2/zoneHourStat` | plazaUnid, zoneUnid, startTime, endTime |
| 19 | Device Info | `/api/v2/base/device` (verified) | plazaUnid |
| 20 | Store Hourly Data | `/api/v2/reid/mallCountingDataHourly` | plazaUnid, startTime, endTime |
| 21 | Entrance Hourly Data | `/api/v2/reid/entranceCountingDataHourly` | plazaUnid, gateUnid, startTime, endTime |
| 22 | Group List | `api/v2/base/groupInfo` (verified) | — |
| 23 | Store-Entrance Counting Daily (V2) | `api/v2/passenger/gateDay` | plazaUnid, gateUnid, startDate, endDate / modifyTime |
| 24 | Store-Entrance Counting Hourly (V2) | `api/v2/passenger/gateHour` (verified) | plazaUnid, gateUnid, startTime, endTime / modifyTime |
| 25 | Store Hourly Customer Segment (V2) | `api/v2/passenger/plazaHour` | plazaUnid, startTime, endTime / modifyTime |
| 26 | Queue daily data | `/api/v2/queue/day` | plazaUnid, startDate, endDate |
| 27 | Queue hourly data | `/api/v2/queue/hour` | plazaUnid, startTime, endTime |

Where a param name is uncertain, try the documented one, then the camelCase/snake_case twin, and record the one
that returned data (an empty `data:[]` with `code:200` counts as "accepted", a `code≠200` message as "rejected").
Also probe every Mall endpoint against the Retail server and vice-versa — several are cross-available (e.g. Mall's
`gateTenMins` may exist on Retail). Use **yesterday** (site-local) as the data window so there is data.

## Deliverables

### 1. `backend/scripts/vion-probe.ts` (run once, keep for re-verification)
- Logs into both servers via `VionClient` (add a thin `raw(path, params)` accessor if `get` is private — do it in the
  script by subclassing or by exporting a helper from the script, not by editing the client).
- For each server × each catalog row: resolve sample ids, try path variants, call, capture: final path, HTTP status,
  envelope `code`, `data` type (array/object/null), row count, first row's keys (flatten one level), 3 sample values
  with strings truncated to 40 chars, elapsed ms, error message. Write `docs/vion-probe-results.json` (redacted).
- Print a compact table to stdout as it goes.

### 2. `docs/VION_API_VERIFIED.md` (generated from the JSON, then hand-edited)
Per server, per endpoint: ✅/⚠️/❌, verified path, params that worked, response keys with a one-line meaning,
quirks (timezone, same-day limit, paging, empty-when, id which level: plaza/floor/gate/zone). Plus a "Cross-server
availability" matrix and a "Docs vs reality" table listing every deviation from the PDFs.

### 3. `.claude/skills/vion-api/` — the skill
```
SKILL.md                 frontmatter name/description; when to use; the 10 things to know; workflow; guardrails
reference/endpoints.md   the verified catalog (copy of the relevant parts of VION_API_VERIFIED.md, kept in sync)
reference/ids.md         how to resolve plaza → floor/gate/zone ids, with the current site→customer map pointers (no unids dumped — tell how to fetch)
scripts/vion.ts          the CLI below
```
`SKILL.md` description must trigger on: Vion, vionyun, vion-cloud, plazaInfo/gateHour/captureRecord, "ดึงข้อมูลกล้อง",
footfall/dwell/heatmap/ReID pulls, "King Power / Panpuri / DO HOME counting data", VION API.
Workflow section: (1) pick server, (2) resolve ids via plazaInfo → gate/zone info, (3) call with same-day windows,
loop days client-side, (4) parse timezones per field, (5) rate etiquette, (6) never persist secrets, (7) prefer
`VionClient` in app code, the CLI for ad-hoc.

### 4. `backend/scripts/vion.ts` — CLI
```
npx tsx scripts/vion.ts <mall|retail> <endpointName|path> [--plazaUnid=…] [--gateUnid=…] [--zoneUnid=…]
      [--floorUnid=…] [--day=YYYY-MM-DD] [--from=… --to=…] [--modifyTime=…] [--page=1 --size=1000]
      [--json | --table] [--out=file.json|.csv]
```
- `endpointName` = catalog key (e.g. `gateHour`, `plazaInfo`, `captureRecord`); unknown name → treat as raw path.
- `--day` expands to `startTime=<day> 00:00:00`, `endTime=<day> 23:59:59`; `--from/--to` across days loops per day
  and concatenates (respect the same-day rule). `--all-pages` follows pageNum until `data` is empty.
- Default output: table of first 20 rows + count; `--json` full. `--out` writes CSV (UTF-8 BOM) or JSON.
- Exit non-zero with the vendor message on `code≠200`.

## Report back
End with: counts (✅/⚠️/❌ per server), the 5 most surprising deviations from the docs, the endpoints that returned
no data yesterday (so we know which features are unused), and `git status`. Do not commit.
