# VION OpenAPI — verified reference

Every endpoint in the two vendor PDFs, called live against **both** servers on **2026-09-17** with the
data window **2026-09-16** (yesterday, site-local). Machine-readable evidence for every line below is in
[`vion-probe-results.json`](./vion-probe-results.json) — regenerate it with:

```bash
docker exec ditech-planner-backend-1 npx tsx scripts/vion-probe.ts   # writes backend/vion-probe-results.json
mv backend/vion-probe-results.json docs/vion-probe-results.json
```

Sample sites used: Mall `SVB` (5 plazas on the account, 140 devices, 164 gates, 4 floors, 53 zones) ·
Retail `Central World` (216 plazas on the account, 6 devices, 7 gates, 10 zones).

| | Mall `mall.vion-cloud.com:18080` | Retail `retail.vionyun.com:18085` |
|---|---|---|
| ✅ returned data | 30 | 22 |
| ⚠️ accepted, no data | 0 | 2 |
| ⛔ not served | 8 | 9 |
| — untestable (no floors on the account) | 0 | 5 |
| **catalog size** | **38** | **38** |

---

## The twelve things to know

1. **There are two APIs, not one.** `/api/v2/**` and `/api/v1/**` differ in envelope, parameter casing,
   login and token. Do not mix them.

   | | `/api/v2/**` | `/api/v1/**` |
   |---|---|---|
   | envelope | `{code, success, message, data}` | `{msg_code, msg_info, data}` |
   | login password | AES-ECB(appkey) + base64 | **plain text** |
   | `atoken` in login reply | `data.atoken` | top level |
   | parameter casing | `plazaUnid` (camelCase) | `plaza_unid` (**snake_case**) |
   | field casing in rows | `channelCount`, `modifyTime` | `channel_count`, `modify_time` |
   | available on | both servers | **Mall only** |

2. **Retail has no v1 API.** Every `/api/v1/*` path on Retail answers HTTP 200 with
   `{"msg_code":501,"msg_info":"atoken verification failed"}` — whether the path exists or not. That reply is
   *not* evidence a path exists; `/api/v1/user/login` on Retail fails with both a plain and an AES password.

3. **Auth.** `POST /api/v2/user/login` with `{appkey, username, password: base64(AES-ECB(appkey, password))}`
   → `{code:200, data:{atoken}}`. Send it as `Authorization: <atoken>` — no `Bearer`, no query param.
   An auth failure is **HTTP 200** with `code:"-1"` or `"501"`, so never branch on the HTTP status alone.
   On Mall, `POST /api/v1/user/login` with the **plain** password returns the *same* token value, usable
   for both APIs.

4. **Paths are case-sensitive and the PDFs are wrong.** `plazainfo` → 404, `plazaInfo` → 200. Same for
   `gateinfo`, `floorinfo`, `zoneinfo`, `floorGateinfo`. When in doubt: documented path → camelCase it →
   try the other version prefix.

5. **`countdate` is the real time parameter for most "daily" endpoints.** The PDFs document
   `startDate`/`endDate`, but ten endpoints reject that with `code:508 "countdate cannot be empty."` and take a
   single `countdate=YYYY-MM-DD` instead. Where `countdate` is required, the documented `startDate/endDate`
   turned out to be **ignored** — dropping them returned identical row counts. **These endpoints are
   one-day-at-a-time; there is no range query.** Loop days client-side.

6. **Hourly endpoints keep `startTime`/`endTime`, and both must sit inside one site-local day.**
   Format `YYYY-MM-DD HH:mm:ss`. Use `<day> 00:00:00` … `<day> 23:59:59`.

7. **`modifyTime` is an incremental cursor, not a filter.** Every `passenger/*` and `reid/gate*|plazaHour`
   endpoint accepts `modifyTime=YYYY-MM-DD HH:mm:ss` *instead of* a window and returns everything the vendor
   has touched since — which crosses day boundaries (Mall `gateHour`: 23 rows for one day vs 32 rows by
   cursor). Use it for incremental sync, never for "the traffic on day X".

8. **`gateUnid` is optional — and an unknown one is silently ignored.** Leave it off `gateHour`,
   `gateDay`, `gateTenMins`, `reid/gateHour`, `reid/gateDay` or `mallEntranceCountingData*` and you get
   **every gate of the site in one call** (SVB: 3,674 rows for a day across 155 gates) — far cheaper than
   looping gates. The flip side: a *wrong* `gateUnid` does not error, it returns the whole site, so a typo
   quietly inflates your numbers by 100×. `zoneUnid`/`storeUnid` behaves properly (`code:-1 "zoneUnid cannot
   be empty."`), and a bad `plazaUnid` is rejected outright.

9. **Paging is `page`, not `pageNum`, and only `captureRecord` has it.** `pageNum` is accepted and
   ignored, so a naive loop re-reads page 1 forever. Read `current`/`pages` out of the envelope to know
   when to stop. The v1 residence endpoints have no paging at all.

10. **Timezones are per field, in the same row.** `countdate`, `counttime`, `counttimeLocal`, `intime`,
   `outtime` are **site-local**. `modifyTime` / `modify_time` is **vendor server time, GMT+8**. Parse each
   field with its own zone (`VION_SERVER_TZ`).

11. **The vendor calls a zone a "store" in half the API.** `zoneInfo` returns `zoneUnid`, but
   `zoneGateInfo`, `storeCountingDataHourly` and `storeCountingDataDaily` demand that same id as
   **`storeUnid`** and echo it back as `storeUnid`/`storeName`. `zoneDwellTime` keeps `zoneUnid`.

12. **Ids are hierarchical and `plazaName` is not unique.** plaza → floor → gate, plaza → zone → gate.
    Key everything on `plazaUnid`; "Central World" exists six times. Zone/floor endpoints need the
    `plazaUnid` that the zone/floor actually belongs to.

---

## Mall server — `http://mall.vion-cloud.com:18080`

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

## Retail server — `http://retail.vionyun.com:18085`

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

---

## Cross-server availability

Several endpoints the PDFs document for only one server work on both — `gateTenMins`, `gateDay`,
`plazaDay`, `passenger/plazaHour`, `reid/gateHour`, `reid/gateDay` and `mallDwellTime` are all
cross-available. The reverse also holds: `reid/plazaHour` is Retail-only even though `passenger/plazaHour`
is on both.

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

✅ data · ⚠️ accepted, empty · ⛔ not served (HTTP 404) · — untestable here

---

## Response fields

Field families that repeat across the counting endpoints:

| Field | Meaning |
|---|---|
| `innum` / `outnum` | people counted entering / leaving during the bucket |
| `outsideNum`, `outsideToLeft`, `outsideToRight` | passers-by in front of the door, and which way they walked |
| `visitors` / `staff` | ReID classification of `innum` (staff are recognised repeat faces) |
| `visitorTraffic`, `customerTraffic`, `customerNum` | de-duplicated people (ReID) vs raw line crossings |
| `passerBy`, `entryRate` | Retail only: footfall past the shop, and `visitors ÷ passerBy` |
| `adult` / `child`, `male` / `female` | demographic split of the counted visitors |
| `ageDistribution.{juvenile,youth,middleAged,elderly}` | four-bucket age histogram |
| `group`, `oneVisitorGroup`, `twoVisitorGroup`, `moreThanTwoVisitorGroup` | party-size split |
| `groupNum`, `familyGroupNum`, `loverGroupNum`, `partnerGroupNum` | Retail party-type split |
| `avgDwellTime`, `totalDwellTime`, `residenceTimeSecond` | dwell in seconds |
| `dwellTime[]` / `dwellTimeDistribution[]` | histogram: `dwellTimeGroup` label + `dwellNum` count |
| `countdate`, `counttime`, `counttimeLocal` | bucket timestamp, **site-local** |
| `modifyTime` | when the vendor last wrote the row, **GMT+8** |
| `deepShoppingNum`, `effectVisitors`, `throughTraffic` | Retail engagement metrics (vendor-defined) |

Two shapes that are easy to misread:

- **`ageDistribution.<bucket>` is a two-element array, not a count** — it is `[maleCount, femaleCount]`.
  Verified at SVB: `{juvenile:[3,3], youth:[47,25], middleAged:[11,2], elderly:[0,0]}` sums to exactly the
  row's `male: 61` / `female: 30`. Summing the pairs gives the bucket total.
- **v1 `residence_time` is in milliseconds.** A row with `intime 15:46:33` / `outtime 16:09:55` carries
  `residence_time: 1402000`. v1 also returns `countdate` as a full datetime (`2026-09-16 00:00:00`),
  where v2 returns a bare date.

⚠️ Mall's `reid/gateDay` and `reid/gateHour` spell it **`gender.femalCount`** (one `e`); Retail's spell it
`gender.femaleCount`. Handle both.

Exact key lists per endpoint, as returned on 2026-09-16:

### Mall server

- **`plazaInfo`** → `provinceName, cityName, businessHours, plazaName, plazaExternalid, plazaUnid`
  - nested: `businessHours[].startTime, businessHours[].endTime, businessHours[].week`
- **`gateInfo`** → `isMallGate, plazaUnid, flag, gateName, gateStatus, gateExternalId, gateUnid`
- **`zoneInfo`** → `area, plazaUnid, floorUnid, zoneName, zoneType, zoneStatus, zoneExternalId, zoneUnid`
- **`floorInfo`** → `plazaUnid, floorName, floorExternalid, floorStatus, floorUnid`
- **`groupInfo`** → `id, name, name_en, pid`
- **`device`** → `serialnum, name, channel_count, mac, local_ip, status, modify_time`
- **`floorGateInfo`** → `floorUnid, gateName, gateStatus, gateUnid`
- **`zoneGateInfo`** → `gateName, gateStatus, gateUnid`
- **`mallCountingDataHourly`** → `plazaUnid, plazaExternalid, plazaName, countdate, counttime, innum, outnum, outsideNum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`mallCountingDataDaily`** → `plazaUnid, plazaExternalid, plazaName, countdate, innum, outnum, outsideNum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, avgDwellTime, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`floorCountingDataHourly`** → `floorUnid, floorExternalid, floorName, countdate, counttime, innum, outnum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`floorCountingDataDaily`** → `floorUnid, floorExternalid, floorName, countdate, innum, outnum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`mallEntranceCountingDataHourly`** → `plazaUnid, gateUnid, gateExternalid, gateName, countdate, counttime, innum, outnum, outsideNum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`mallEntranceCountingDataDaily`** → `plazaUnid, gateUnid, gateExternalid, gateName, countdate, innum, outnum, outsideNum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`floorEntranceCountingDataHourly`** → `plazaUnid, gateUnid, gateExternalid, gateName, countdate, counttime, innum, outnum, outsideNum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`floorEntranceCountingDataDaily`** → `plazaUnid, gateUnid, gateExternalid, gateName, countdate, innum, outnum, outsideNum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`storeCountingDataHourly`** → `storeUnid, storeExternalid, storeName, countdate, counttime, innum, outnum, outsideNum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`storeCountingDataDaily`** → `storeUnid, storeExternalid, storeName, countdate, innum, outnum, outsideNum, visitors, staff, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, avgDwellTime, dwellTimeDistribution, ageDistribution`
  - nested: `dwellTimeDistribution[].dwellNum, dwellTimeDistribution[].percent, dwellTimeDistribution[].dwellTimeGroup, ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`zoneDwellTime`** → `plazaUnid, zoneUnid, zoneName, countdate, totalDwellTime, avgDwellTime, dwellTime`
  - nested: `dwellTime[].dwellNum, dwellTime[].dwellTimeGroup`
- **`mallDwellTime`** → `plazaUnid, plazaName, countdate, totalDwellTime, avgDwellTime, dwellTime`
  - nested: `dwellTime[].dwellNum, dwellTime[].dwellTimeGroup`
- **`plazaResidence`** → `plaza_unid, person_unid, plaza_name, intime, outtime, residence_time, countdate, plaza_externalid`
- **`zoneResidence`** → `person_unid, plaza_name, zone_unid, zone_name, intime, outtime, residence_time, countdate`
- **`captureRecord`** → `unid, personUnid, personType, gateUnid, plazaUnid, age, gender, direction, counttimeLocal, countdate`
- **`gateHour`** → `plazaUnid, gateUnid, gateExternalid, countdate, counttimeLocal, innum, outnum, customerNum, modifyTime`
- **`gateDay`** → `plazaUnid, gateUnid, gateExternalid, countdate, innum, outnum, customerNum, modifyTime`
- **`gateTenMins`** → `plazaUnid, gateUnid, gateExternalid, countdate, counttimeLocal, innum, outnum, modifyTime`
- **`passengerPlazaHour`** → `plazaUnid, plazaExternalid, plazaName, countdate, counttimeLocal, innum, outnum, customerNum, modifyTime`
- **`plazaDay`** → `plazaUnid, plazaExternalid, plazaName, countdate, innum, outnum, customerNum, weather, ltemp, htemp, provinceName, cityName, dwellTime, modifyTime`
- **`reidGateDay`** → `plazaUnid, gateUnid, gateExternalid, countdate, customerNum, modifyTime, gender, age`
  - nested: `gender.maleCount, gender.femalCount, age.juvenile, age.youth, age.middleAged, age.elderly`
- **`reidGateHour`** → `plazaUnid, gateUnid, gateExternalid, countdate, counttimeLocal, customerNum, modifyTime, gender, age`
  - nested: `gender.maleCount, gender.femalCount, age.juvenile, age.youth, age.middleAged, age.elderly`

### Retail server

- **`plazaInfo`** → `provinceName, cityName, countyName, timeZone, businessHours, configs, labelNameList, plazaName, launchTime, plazaExternalid, plazaUnid`
  - nested: `businessHours[].startTime, businessHours[].endTime, businessHours[].week, configs.passTrafficConfig, configs.stayTimeConfig, configs.longDwellThreshold`
- **`gateInfo`** → `isMallGate, plazaUnid, isPassBy, gateName, gateStatus, gateUnid`
- **`zoneInfo`** → `plazaUnid, channel, zoneName, zoneStatus, zoneExternalId, zoneUnid`
  - nested: `channel[].rareaInfo`
- **`groupInfo`** → `name, groups`
  - nested: `groups[].id, groups[].parentId, groups[].name`
- **`device`** → `serialnum, name, channelCount, mac, localIp, hardware, status, modifyTime, bindTime, channelList`
  - nested: `channelList[].serialnum, channelList[].channelNo, channelList[].site`
- **`mallCountingDataHourly`** → `plazaUnid, plazaExternalid, plazaName, countdate, counttime, innum, outnum, outsideToLeft, outsideToRight, visitorTraffic, visitors, visitorsOut, staff, staffOut, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`mallCountingDataDaily`** → `plazaUnid, plazaExternalid, plazaName, countdate, innum, outnum, outsideToLeft, outsideToRight, visitorTraffic, visitors, visitorsOut, staff, staffOut, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`entranceCountingDataHourly`** → `plazaUnid, gateUnid, countdate, counttime, innum, outnum, outsideToLeft, outsideToRight, visitorTraffic, visitors, visitorsOut, staff, staffOut, adult, child, male, female, group, oneVisitorGroup, twoVisitorGroup, moreThanTwoVisitorGroup, ageDistribution`
  - nested: `ageDistribution.juvenile, ageDistribution.youth, ageDistribution.middleAged, ageDistribution.elderly`
- **`mallDwellTime`** → `plazaUnid, plazaName, countdate, totalDwellTime, avgDwellTime, dwellTime`
  - nested: `dwellTime[].dwellNum, dwellTime[].dwellTimeGroup`
- **`captureRecord`** → `unid, personUnid, personType, gateUnid, plazaUnid, age, gender, direction, counttimeLocal, countdate`
- **`gateHour`** → `plazaUnid, gateUnid, countdate, counttimeLocal, innum, outnum, outsideNum, outsideToLeft, outsideToRight, customerTraffic, customerNum, modifyTime, groupNum, singleGroupNum, doubleGroupNum, multipleGroupNum, familyGroupNum, loverGroupNum, partnerGroupNum`
- **`gateDay`** → `plazaUnid, gateUnid, countdate, innum, outnum, outsideNum, outsideToLeft, outsideToRight, customerTraffic, customerNum, groupNum, singleGroupNum, doubleGroupNum, multipleGroupNum, familyGroupNum, loverGroupNum, partnerGroupNum`
- **`gateTenMins`** → `plazaUnid, gateUnid, countdate, counttimeLocal, innum, outnum, outsideNum, modifyTime`
- **`passengerPlazaHour`** → `plazaUnid, plazaExternalid, plazaName, countdate, counttimeLocal, innum, outnum, outsideNum, passerBy, customerTraffic, customerNum, staffCount, outsideInnum, outsideOutnum, throughTraffic, effectVisitors, deepShoppingNum, groupName, residenceTimeSecond, modifyTime, groupNum, singleGroupNum, doubleGroupNum, multipleGroupNum, familyGroupNum, loverGroupNum, partnerGroupNum`
- **`plazaDay`** → `plazaUnid, plazaExternalid, plazaName, countdate, innum, outnum, outsideNum, passerBy, customerTraffic, customerNum, staffCount, outsideInnum, outsideOutnum, throughTraffic, effectVisitors, provinceName, cityName, countyName, entryRate, deepShoppingNum, deepShoppingRate, groupName, residenceTimeSecond, groupNum, singleGroupNum, doubleGroupNum, multipleGroupNum, familyGroupNum, loverGroupNum, partnerGroupNum`
- **`plazaHour`** → `plazaUnid, plazaExternalid, plazaName, countdate, counttimeLocal, customerNum, modifyTime, gender, age`
  - nested: `gender.maleCount, gender.femaleCount, age.juvenile, age.youth, age.middleAged, age.elderly`
- **`reidGateDay`** → `plazaUnid, gateUnid, countdate, customerNum, modifyTime, gender, age`
  - nested: `gender.maleCount, gender.femaleCount, age.juvenile, age.youth, age.middleAged, age.elderly`
- **`reidGateHour`** → `plazaUnid, gateUnid, countdate, counttimeLocal, customerNum, modifyTime, gender, age`
  - nested: `gender.maleCount, gender.femaleCount, age.juvenile, age.youth, age.middleAged, age.elderly`
- **`heatMap`** → `imgUrl, heat`
  - nested: `heat[].residenceTimeTotal, heat[].rx, heat[].ry`
- **`gateFlowDirection`** → `source, target, value`
- **`zoneStat`** → `zoneUnid, zoneName`
- **`zoneHourStat`** → `counttimeLocal, personMantime, personMantimeOut, customerMantime, customerMantimeOut, personCount, personCountOut, staffMantime, staffMantimeOut, age, gender, zoneUnid, zoneName`
  - nested: `age.juvenile, age.youth, age.middleAged, age.elderly, gender.maleCount, gender.femaleCount`

---

## Docs vs reality

| # | The PDF says | Reality |
|---|---|---|
| 1 | `api/v2/base/plazainfo`, `gateinfo`, `floorinfo`, `zoneinfo`, `floorGateinfo` | all 404 — the paths are camelCase (`plazaInfo`, `gateInfo`, …) |
| 2 | Daily endpoints take `startDate` + `endDate` | 10 endpoints reject that and demand a single `countdate`; `startDate`/`endDate` are then ignored. No date ranges anywhere. |
| 3 | `zoneGateInfo` takes `zoneUnid` | takes **`storeUnid`** (`code:-1 "storeUnid cannot be empty."`) |
| 4 | `storeCountingDataHourly` / `Daily` take `zoneUnid` | take **`storeUnid`**, and return `storeUnid`/`storeName` |
| 5 | `zoneDwellTime` takes `startTime`/`endTime` | takes `countdate`; keeps the name `zoneUnid` |
| 6 | Mall has no `groupInfo` (v2 → 404) | Mall serves it at **`/api/v1/base/groupInfo`**, flat `[{id, pid, name, name_en}]` — not Retail's `[{name, groups[]}]` tree |
| 7 | Device Info is `api/v1/base/device` | both work on Mall — v1 needs `plaza_unid` and returns `channel_count`/`local_ip`/`modify_time`; v2 (`/api/v2/base/device?plazaUnid=`) is camelCase and adds `channelList[]`. **Use v2**; it is the only one Retail has. |
| 8 | `api/v1/residence/plazaResidence` takes `plazaUnid` + `countdate` | takes **`plaza_unid`** + `countdate` (snake_case), Mall only, and returns **every visit row** — 23,120 rows for one day at SVB, with no working page parameter |
| 9 | `api/v1/passenger/gateHour` | exists on Mall but is broken: `msg_code:500 "System error!"`, then `506 "Data does not exist or search error"`. Use `/api/v2/passenger/gateHour`. |
| 10 | `api/v2/queue/hour` takes `plazaUnid` + a window | also demands `countdate` **and** `timeInterval` ∈ `[1, 5, 60]` |
| 11 | `gateFlowDirection`, `zoneStat`, `zoneHourStat` take windows | all three demand `countdate` (`zoneStat` additionally ignores `zoneUnid` and returns every zone) |
| 12 | Entrance counting is one endpoint | Mall uses `reid/mallEntranceCountingData*`, Retail uses `reid/entranceCountingDataHourly` — each 404s on the other server |
| 13 | Retail has floors | it does not: `floorInfo` 404s, so all five floor endpoints are untestable there |
| 14 | `captureRecord` pages with `pageNum` | **`pageNum` is silently ignored** — the server accepts it, answers `code:200` and hands back page 1 every time. The real parameter is **`page`**. Paging blindly on `pageNum` yields the same 1000 rows forever. The envelope is `{records, total, size, current, pages}`; trust `current`/`pages`. |
| 15 | `gateUnid` is a required filter | it is optional on every `passenger/*` and `reid/gate*` endpoint; omitted, you get all gates of the site in one call. An **unknown** `gateUnid` is ignored rather than rejected — same result, no warning. |
| 16 | `plazaResidence` / `zoneResidence` take paging | they take none, under any spelling — one call returns the whole day (23,120 rows at SVB). Budget for it. |

---

## Returned no data for 2026-09-16

| Server | Endpoint | Outcome |
|---|---|---|
| retail | `queueDay` | accepted, `data: []` |
| retail | `queueHour` | accepted, `data: []` |
| retail | `zoneStat` | `code:200`, 11 rows but every row carries only `zoneUnid` + `zoneName` — no metrics |

`queueDay` / `queueHour` are the only two endpoints that answered `code:200` with nothing in them —
queue analytics is simply not switched on for any site we can see. Retail `zoneStat` answers but carries no
measurements, while `zoneHourStat` on the same zone and day returns 120 populated rows, so prefer the hourly one.

---

## Using it

```bash
# ad-hoc, from the host
docker exec ditech-planner-backend-1 npx tsx scripts/vion.ts list
docker exec ditech-planner-backend-1 npx tsx scripts/vion.ts retail gateHour \
  --plazaUnid=<unid> --gateUnid=<unid> --day=2026-09-16
```

In application code use `backend/src/integrations/vion/vion.client.ts` (token cache + re-auth), not the CLI.
The reusable skill lives in `.claude/skills/vion-api/`.
