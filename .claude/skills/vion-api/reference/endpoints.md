# Verified endpoint catalog

Kept in sync with `docs/VION_API_VERIFIED.md` (the long form, with every response field and the full
docs-vs-reality list). Probed live on 2026-09-17 with the window 2026-09-16.
Row counts are what one sample site returned that day — they say "this works", not "expect this many".

`--<param>` in the CLI maps to the query parameter of the same name; the CLI renames `zoneUnid` → `storeUnid`
and camelCase → snake_case for `/api/v1/` paths on its own.

## Mall — `mall.vion-cloud.com:18080`  (sample site: SVB)

| Endpoint | | Verified path | Params that work | Rows (2026-09-16) |
|---|:--:|---|---|--:|
| `plazaInfo`<br><sub>Mall/Store Info List</sub> | ✅ | `/api/v2/base/plazaInfo` | (none) | 5 |
| `gateInfo`<br><sub>Entrance Info List</sub> | ✅ | `/api/v2/base/gateInfo` | `plazaUnid` | 164 |
| `zoneInfo`<br><sub>Store/Zone Info List</sub> | ✅ | `/api/v2/base/zoneInfo` | `plazaUnid` | 53 |
| `floorInfo`<br><sub>Floor Info List</sub> | ✅ | `/api/v2/base/floorInfo` | `plazaUnid` | 4 |
| `groupInfo`<br><sub>Account → group tree</sub> | ✅ | `/api/v1/base/groupInfo` | (none) | 2 |
| `device`<br><sub>Device Info</sub> | ✅ | `/api/v1/base/device` | `plaza_unid` | 140 |
| `floorGateInfo`<br><sub>Floor-Entrance Info List</sub> | ✅ | `/api/v2/base/floorGateInfo` | `floorUnid` | 118 |
| `zoneGateInfo`<br><sub>Store-Entrance Info List</sub> | ✅ | `/api/v2/base/zoneGateInfo` | `storeUnid` | 10 |
| `mallCountingDataHourly`<br><sub>Mall Counting Data Hourly</sub> | ✅ | `/api/v2/reid/mallCountingDataHourly` | `plazaUnid`, `startTime`, `endTime` | 24 |
| `mallCountingDataDaily`<br><sub>Mall Counting Data Daily</sub> | ✅ | `/api/v2/reid/mallCountingDataDaily` | `plazaUnid`, `countdate` | 1 |
| `floorCountingDataHourly`<br><sub>Floor Counting Data Hourly</sub> | ✅ | `/api/v2/reid/floorCountingDataHourly` | `plazaUnid`, `floorUnid`, `startTime`, `endTime` | 24 |
| `floorCountingDataDaily`<br><sub>Floor Counting Data Daily</sub> | ✅ | `/api/v2/reid/floorCountingDataDaily` | `plazaUnid`, `floorUnid`, `countdate` | 1 |
| `mallEntranceCountingDataHourly`<br><sub>Mall Entrance Counting Hourly</sub> | ✅ | `/api/v2/reid/mallEntranceCountingDataHourly` | `plazaUnid`, `gateUnid`, `startTime`, `endTime` | 24 |
| `mallEntranceCountingDataDaily`<br><sub>Mall Entrance Counting Daily</sub> | ✅ | `/api/v2/reid/mallEntranceCountingDataDaily` | `plazaUnid`, `gateUnid`, `countdate` | 1 |
| `floorEntranceCountingDataHourly`<br><sub>Floor Entrance Counting Hourly</sub> | ✅ | `/api/v2/reid/floorEntranceCountingDataHourly` | `plazaUnid`, `floorUnid`, `gateUnid`, `startTime`, `endTime` | 23 |
| `floorEntranceCountingDataDaily`<br><sub>Floor Entrance Counting Daily</sub> | ✅ | `/api/v2/reid/floorEntranceCountingDataDaily` | `plazaUnid`, `floorUnid`, `gateUnid`, `countdate` | 1 |
| `storeCountingDataHourly`<br><sub>Store Counting Data Hourly</sub> | ✅ | `/api/v2/reid/storeCountingDataHourly` | `plazaUnid`, `storeUnid`, `startTime`, `endTime` | 24 |
| `storeCountingDataDaily`<br><sub>Store Counting Data Daily</sub> | ✅ | `/api/v2/reid/storeCountingDataDaily` | `plazaUnid`, `storeUnid`, `countdate` | 1 |
| `entranceCountingDataHourly`<br><sub>Entrance Hourly Data</sub> | ⛔ | ~~`/api/v2/reid/entranceCountingDataHourly`~~ — not served here |  |  |
| `zoneDwellTime`<br><sub>Store DwellTime (zone)</sub> | ✅ | `/api/v2/reid/zoneDwellTime` | `plazaUnid`, `zoneUnid`, `countdate` | 1 |
| `mallDwellTime`<br><sub>Store DwellTime (whole site)</sub> | ✅ | `/api/v2/reid/mallDwellTime` | `plazaUnid`, `countdate` | 1 |
| `plazaResidence`<br><sub>DwellTime, every customer (site)</sub> | ✅ | `/api/v1/residence/plazaResidence` | `plaza_unid`, `countdate` | 23120 |
| `zoneResidence`<br><sub>DwellTime, every customer (zone)</sub> | ✅ | `/api/v1/residence/zoneResidence` | `plaza_unid`, `zone_unid`, `countdate` | 1642 |
| `captureRecord`<br><sub>Capture / ReID record</sub> | ✅ | `/api/v2/captureRecord` | `plazaUnid`, `countdate`, `page`, `pageSize` | 1000 |
| `gateHour`<br><sub>Entrance Counting Hourly</sub> | ✅ | `/api/v2/passenger/gateHour` | `plazaUnid`, `gateUnid`, `startTime`, `endTime` | 23 |
| `gateDay`<br><sub>Entrance Counting Daily</sub> | ✅ | `/api/v2/passenger/gateDay` | `plazaUnid`, `gateUnid`, `startDate`, `endDate` | 1 |
| `gateTenMins`<br><sub>Entrance Counting (10 minutes)</sub> | ✅ | `/api/v2/passenger/gateTenMins` | `plazaUnid`, `gateUnid`, `startTime`, `endTime` | 128 |
| `passengerPlazaHour`<br><sub>Site Hourly Counting (passenger)</sub> | ✅ | `/api/v2/passenger/plazaHour` | `plazaUnid`, `startTime`, `endTime` | 24 |
| `plazaDay`<br><sub>Site Daily Counting (passenger)</sub> | ✅ | `/api/v2/passenger/plazaDay` | `plazaUnid`, `startDate`, `endDate` | 1 |
| `plazaHour`<br><sub>Site Hourly Customer Segment (reid)</sub> | ⛔ | ~~`/api/v2/reid/plazaHour`~~ — not served here |  |  |
| `reidGateDay`<br><sub>Entrance Daily Demographics</sub> | ✅ | `/api/v2/reid/gateDay` | `plazaUnid`, `gateUnid`, `startDate`, `endDate` | 1 |
| `reidGateHour`<br><sub>Entrance Hourly Demographics</sub> | ✅ | `/api/v2/reid/gateHour` | `plazaUnid`, `gateUnid`, `startTime`, `endTime` | 23 |
| `heatMap`<br><sub>Heatmap</sub> | ⛔ | ~~`/api/v2/heatMap`~~ — not served here |  |  |
| `gateFlowDirection`<br><sub>Entrance Visitor Flow</sub> | ⛔ | ~~`/api/v2/gateFlowDirection`~~ — not served here |  |  |
| `zoneStat`<br><sub>Store zone data (daily)</sub> | ⛔ | ~~`/api/v2/zoneStat`~~ — not served here |  |  |
| `zoneHourStat`<br><sub>Store zone data (hourly)</sub> | ⛔ | ~~`/api/v2/zoneHourStat`~~ — not served here |  |  |
| `queueDay`<br><sub>Queue daily data</sub> | ⛔ | ~~`/api/v2/queue/day`~~ — not served here |  |  |
| `queueHour`<br><sub>Queue hourly data</sub> | ⛔ | ~~`/api/v2/queue/hour`~~ — not served here |  |  |

## Retail — `retail.vionyun.com:18085`  (sample site: Central World)

| Endpoint | | Verified path | Params that work | Rows (2026-09-16) |
|---|:--:|---|---|--:|
| `plazaInfo`<br><sub>Mall/Store Info List</sub> | ✅ | `/api/v2/base/plazaInfo` | (none) | 216 |
| `gateInfo`<br><sub>Entrance Info List</sub> | ✅ | `/api/v2/base/gateInfo` | `plazaUnid` | 7 |
| `zoneInfo`<br><sub>Store/Zone Info List</sub> | ✅ | `/api/v2/base/zoneInfo` | `plazaUnid` | 10 |
| `floorInfo`<br><sub>Floor Info List</sub> | ⛔ | ~~`/api/v2/base/floorinfo`~~ — not served here |  |  |
| `groupInfo`<br><sub>Account → group tree</sub> | ✅ | `/api/v2/base/groupInfo` | (none) | 10 |
| `device`<br><sub>Device Info</sub> | ✅ | `/api/v2/base/device` | `plazaUnid` | 6 |
| `floorGateInfo`<br><sub>Floor-Entrance Info List</sub> | — | ~~`/api/v2/base/floorGateinfo`~~ — no floors on this account |  |  |
| `zoneGateInfo`<br><sub>Store-Entrance Info List</sub> | ⛔ | ~~`/api/v2/base/zoneGateInfo`~~ — not served here |  |  |
| `mallCountingDataHourly`<br><sub>Mall Counting Data Hourly</sub> | ✅ | `/api/v2/reid/mallCountingDataHourly` | `plazaUnid`, `startTime`, `endTime` | 12 |
| `mallCountingDataDaily`<br><sub>Mall Counting Data Daily</sub> | ✅ | `/api/v2/reid/mallCountingDataDaily` | `plazaUnid`, `countdate` | 1 |
| `floorCountingDataHourly`<br><sub>Floor Counting Data Hourly</sub> | — | ~~`/api/v2/reid/floorCountingDataHourly`~~ — no floors on this account |  |  |
| `floorCountingDataDaily`<br><sub>Floor Counting Data Daily</sub> | — | ~~`/api/v2/reid/floorCountingDataDaily`~~ — no floors on this account |  |  |
| `mallEntranceCountingDataHourly`<br><sub>Mall Entrance Counting Hourly</sub> | ⛔ | ~~`/api/v2/reid/mallEntranceCountingDataHourly`~~ — not served here |  |  |
| `mallEntranceCountingDataDaily`<br><sub>Mall Entrance Counting Daily</sub> | ⛔ | ~~`/api/v2/reid/mallEntranceCountingDataDaily`~~ — not served here |  |  |
| `floorEntranceCountingDataHourly`<br><sub>Floor Entrance Counting Hourly</sub> | — | ~~`/api/v2/reid/floorEntranceCountingDataHourly`~~ — no floors on this account |  |  |
| `floorEntranceCountingDataDaily`<br><sub>Floor Entrance Counting Daily</sub> | — | ~~`/api/v2/reid/floorEntranceCountingDataDaily`~~ — no floors on this account |  |  |
| `storeCountingDataHourly`<br><sub>Store Counting Data Hourly</sub> | ⛔ | ~~`/api/v2/reid/storeCountingDataHourly`~~ — not served here |  |  |
| `storeCountingDataDaily`<br><sub>Store Counting Data Daily</sub> | ⛔ | ~~`/api/v2/reid/storeCountingDataDaily`~~ — not served here |  |  |
| `entranceCountingDataHourly`<br><sub>Entrance Hourly Data</sub> | ✅ | `/api/v2/reid/entranceCountingDataHourly` | `plazaUnid`, `gateUnid`, `startTime`, `endTime` | 12 |
| `zoneDwellTime`<br><sub>Store DwellTime (zone)</sub> | ⛔ | ~~`/api/v2/reid/zoneDwellTime`~~ — not served here |  |  |
| `mallDwellTime`<br><sub>Store DwellTime (whole site)</sub> | ✅ | `/api/v2/reid/mallDwellTime` | `plazaUnid`, `countdate` | 1 |
| `plazaResidence`<br><sub>DwellTime, every customer (site)</sub> | ⛔ | ~~`/api/v1/residence/plazaResidence`~~ — not served here |  |  |
| `zoneResidence`<br><sub>DwellTime, every customer (zone)</sub> | ⛔ | ~~`/api/v1/residence/zoneResidence`~~ — not served here |  |  |
| `captureRecord`<br><sub>Capture / ReID record</sub> | ✅ | `/api/v2/captureRecord` | `plazaUnid`, `countdate`, `page`, `pageSize` | 1000 |
| `gateHour`<br><sub>Entrance Counting Hourly</sub> | ✅ | `/api/v2/passenger/gateHour` | `plazaUnid`, `gateUnid`, `startTime`, `endTime` | 12 |
| `gateDay`<br><sub>Entrance Counting Daily</sub> | ✅ | `/api/v2/passenger/gateDay` | `plazaUnid`, `gateUnid`, `startDate`, `endDate` | 1 |
| `gateTenMins`<br><sub>Entrance Counting (10 minutes)</sub> | ✅ | `/api/v2/passenger/gateTenMins` | `plazaUnid`, `gateUnid`, `startTime`, `endTime` | 71 |
| `passengerPlazaHour`<br><sub>Site Hourly Counting (passenger)</sub> | ✅ | `/api/v2/passenger/plazaHour` | `plazaUnid`, `startTime`, `endTime` | 12 |
| `plazaDay`<br><sub>Site Daily Counting (passenger)</sub> | ✅ | `/api/v2/passenger/plazaDay` | `plazaUnid`, `startDate`, `endDate` | 1 |
| `plazaHour`<br><sub>Site Hourly Customer Segment (reid)</sub> | ✅ | `/api/v2/reid/plazaHour` | `plazaUnid`, `startTime`, `endTime` | 12 |
| `reidGateDay`<br><sub>Entrance Daily Demographics</sub> | ✅ | `/api/v2/reid/gateDay` | `plazaUnid`, `gateUnid`, `startDate`, `endDate` | 1 |
| `reidGateHour`<br><sub>Entrance Hourly Demographics</sub> | ✅ | `/api/v2/reid/gateHour` | `plazaUnid`, `gateUnid`, `startTime`, `endTime` | 12 |
| `heatMap`<br><sub>Heatmap</sub> | ✅ | `/api/v2/heatMap` | `plazaUnid`, `countdate` | 1 |
| `gateFlowDirection`<br><sub>Entrance Visitor Flow</sub> | ✅ | `/api/v2/gateFlowDirection` | `plazaUnid`, `gateUnid`, `countdate` | 86 |
| `zoneStat`<br><sub>Store zone data (daily)</sub> | ✅ | `/api/v2/zoneStat` | `plazaUnid`, `zoneUnid`, `countdate` | 11 |
| `zoneHourStat`<br><sub>Store zone data (hourly)</sub> | ✅ | `/api/v2/zoneHourStat` | `plazaUnid`, `zoneUnid`, `countdate` | 120 |
| `queueDay`<br><sub>Queue daily data</sub> | ⚠️ | `/api/v2/queue/day` | `plazaUnid`, `startDate`, `endDate` | 0 |
| `queueHour`<br><sub>Queue hourly data</sub> | ⚠️ | `/api/v2/queue/hour` | `plazaUnid`, `countdate`, `timeInterval` | 0 |

## Cross-server availability

| Endpoint | Mall | Retail | Documented for |
|---|:--:|:--:|---|
| `plazaInfo` | ✅ | ✅ | mall + retail |
| `gateInfo` | ✅ | ✅ | mall + retail |
| `zoneInfo` | ✅ | ✅ | mall + retail |
| `floorInfo` | ✅ | ⛔ | mall |
| `groupInfo` | ✅ | ✅ | retail |
| `device` | ✅ | ✅ | mall + retail |
| `floorGateInfo` | ✅ | — | mall |
| `zoneGateInfo` | ✅ | ⛔ | mall |
| `mallCountingDataHourly` | ✅ | ✅ | mall + retail |
| `mallCountingDataDaily` | ✅ | ✅ | mall |
| `floorCountingDataHourly` | ✅ | — | mall |
| `floorCountingDataDaily` | ✅ | — | mall |
| `mallEntranceCountingDataHourly` | ✅ | ⛔ | mall |
| `mallEntranceCountingDataDaily` | ✅ | ⛔ | mall |
| `floorEntranceCountingDataHourly` | ✅ | — | mall |
| `floorEntranceCountingDataDaily` | ✅ | — | mall |
| `storeCountingDataHourly` | ✅ | ⛔ | mall |
| `storeCountingDataDaily` | ✅ | ⛔ | mall |
| `entranceCountingDataHourly` | ⛔ | ✅ | retail |
| `zoneDwellTime` | ✅ | ⛔ | mall |
| `mallDwellTime` | ✅ | ✅ | retail |
| `plazaResidence` | ✅ | ⛔ | mall + retail |
| `zoneResidence` | ✅ | ⛔ | mall |
| `captureRecord` | ✅ | ✅ | mall + retail |
| `gateHour` | ✅ | ✅ | mall + retail |
| `gateDay` | ✅ | ✅ | retail |
| `gateTenMins` | ✅ | ✅ | mall |
| `passengerPlazaHour` | ✅ | ✅ | retail |
| `plazaDay` | ✅ | ✅ | retail |
| `plazaHour` | ⛔ | ✅ | retail |
| `reidGateDay` | ✅ | ✅ | retail |
| `reidGateHour` | ✅ | ✅ | retail |
| `heatMap` | ⛔ | ✅ | retail |
| `gateFlowDirection` | ⛔ | ✅ | retail |
| `zoneStat` | ⛔ | ✅ | retail |
| `zoneHourStat` | ⛔ | ✅ | retail |
| `queueDay` | ⛔ | ⚠️ | retail |
| `queueHour` | ⛔ | ⚠️ | retail |

✅ returns data · ⚠️ accepted but empty · ⛔ not served (HTTP 404) · — untestable (no floors on the Retail account)

## Choosing an endpoint

| You want | Mall | Retail |
|---|---|---|
| Site totals per hour | `passengerPlazaHour` | `passengerPlazaHour` (raw) or `plazaHour` (demographics) |
| Site totals per day | `plazaDay` | `plazaDay` — carries `entryRate`, `passerBy`, `deepShoppingNum` |
| One entrance, per hour | `gateHour` | `gateHour` |
| One entrance, per hour + gender/age | `reidGateHour` | `reidGateHour` |
| One entrance, 10-minute buckets | `gateTenMins` | `gateTenMins` |
| Whole-site footfall with demographics | `mallCountingDataHourly` / `…Daily` | `mallCountingDataHourly` / `…Daily` |
| One floor | `floorCountingData*`, `floorEntranceCountingData*` | — (no floors) |
| One in-mall store / zone | `storeCountingData*` (`storeUnid`) | `zoneHourStat` (`zoneStat` returns ids only) |
| Dwell time, aggregated | `mallDwellTime`, `zoneDwellTime` | `mallDwellTime` |
| Dwell time, one row per visit | `plazaResidence`, `zoneResidence` (v1, snake_case) | — (no v1 API) |
| Every face/ReID capture | `captureRecord` (paged, 1000/page) | `captureRecord` |
| Heatmap image + point cloud | — | `heatMap` |
| Entrance-to-entrance flow | — | `gateFlowDirection` |
| All entrances of a site at once | `gateHour` / `gateDay` **without** `--gateUnid` | same |
| Cameras / device health | `device` | `device` |
| Customer → site ownership | `groupInfo` (v1, flat `id`/`pid`) | `groupInfo` (v2, `name` + `groups[]` tree) |

## Traps

- `startDate`/`endDate` are accepted-then-ignored wherever `countdate` is required. One day per call.
- **A wrong `gateUnid` is not an error** — the vendor ignores it and returns every gate of the site. Always
  check that the rows you got back carry the `gateUnid` you asked for.
- Conversely, **omitting `gateUnid` is the efficient way to get all gates** of a site in one call.
- `modifyTime` ignores the day entirely and returns everything changed since that instant (GMT+8).
- Mall's `reid/gate*` spells it `gender.femalCount`; Retail spells it `gender.femaleCount`.
- `zoneStat` (Retail) ignores `zoneUnid` and returns every zone, with no metrics — use `zoneHourStat`.
- `queueDay` / `queueHour` answer `code:200` with `[]` everywhere: queue analytics is not enabled.
- `/api/v1/passenger/gateHour` exists on Mall but returns `msg_code:500 "System error!"`. Use the v2 path.
- **`captureRecord` pages with `page`, not the documented `pageNum`** — `pageNum` is accepted and ignored,
  so looping on it re-reads page 1 forever. The envelope carries `{total, size, current, pages}`; stop on those.
- `plazaResidence` / `zoneResidence` have no paging and return the whole day in one response (23k rows at SVB).
- `ageDistribution.<bucket>` is `[maleCount, femaleCount]`, not a single number.
- v1 `residence_time` is in **milliseconds**; v1 `countdate` comes back as a datetime, v2 as a bare date.
