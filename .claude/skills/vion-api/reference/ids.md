# Resolving ids

Every data endpoint is keyed on a `unid` (a UUID string). **Never hard-code one into a file** — they differ
per server, the vendor re-issues them, and `plazaName` is not unique enough to guess from. Fetch them.

```
plazaUnid ─┬─ floorUnid ── gateUnid      (Mall only: floorInfo → floorGateInfo)
           ├─ gateUnid                   (gateInfo — the site's own entrances)
           └─ zoneUnid ── gateUnid       (zoneInfo → zoneGateInfo; "zone" = a store inside the site)
```

## 1. Which server is this site on?

The local DB already knows, and asking it costs no vendor calls:

```bash
docker exec ditech-planner-postgres-1 psql -U ditech -d ditech_planner -c \
 "SELECT source, \"plazaUnid\", \"plazaName\", \"timeZone\" FROM \"MonitoredSite\" WHERE \"plazaName\" ILIKE '%<name>%';"
```

`source` is `MALL` or `RETAIL` and maps straight to the CLI's first argument. If the site isn't in the table,
fall back to `plazaInfo` on both servers and match on name.

## 2. plazaUnid

```bash
docker exec ditech-planner-backend-1 npx tsx scripts/vion.ts retail plazaInfo --limit=50
```

Returns every site on the account (Mall: 5, Retail: 216). Useful fields: `plazaUnid`, `plazaName`,
`plazaExternalid`, `businessHours[]` (`week` 1–7, `startTime`, `endTime`; `00:00–00:00` means "never
configured"), and on Retail also `timeZone`, `launchTime`, `configs.longDwellThreshold`.

⚠️ Names collide heavily — six sites are called "Central World". Disambiguate with `plazaExternalid`, the
address fields, or the device list, and carry the `plazaUnid` from there on.

## 3. gateUnid

```bash
… scripts/vion.ts <server> gateInfo --plazaUnid=<unid>
```

- `isMallGate=1` — a real building entrance. These are what "footfall of the mall" means.
- `isMallGate=0` — an internal or tenant door.
- `isPassBy=1` (Retail) — a passer-by counting line, not an entrance; it feeds `passerBy` / `entryRate`,
  not `innum`.
- `gateStatus=1` — active. Inactive gates still return rows, all zeros.

For a floor's entrances on Mall, go through the floor: `floorInfo --plazaUnid=` → `floorGateInfo --floorUnid=`.

## 4. zoneUnid (= "storeUnid")

```bash
… scripts/vion.ts <server> zoneInfo --plazaUnid=
```

`zoneInfo` returns `zoneUnid` / `zoneName`, plus `floorUnid` on Mall and the drawn polygon in
`channel[].rareaInfo` on Retail. The same id must be sent as **`storeUnid`** to `zoneGateInfo`,
`storeCountingDataHourly` and `storeCountingDataDaily` — the CLI does that renaming for you.

Not every site has zones. Mall SVB has 53; most Retail shops have none.

## 5. Devices and channels

```bash
… scripts/vion.ts <server> device --plazaUnid=
```

`status`: `0` offline · `1` online · `3` disabled. `channelList[].site.gateUnid` links a camera channel to
the gate it counts — the only place the camera↔gate mapping is exposed. `modifyTime` here is **GMT+8** and is
not a "last seen": for online devices the vendor touches it nightly at 00:00.

## 6. Site → customer

Ownership is not a vendor field; it is stitched together locally.

| Source | Where | Notes |
|---|---|---|
| `MonitoredSite.customerId` → `Customer` | DB | the authoritative mapping used by the app |
| `MonitoredSite.customerSource` | DB | `VENDOR` (derived from `groupInfo`) or `MANUAL` (never overwritten by sync) |
| `MonitoredSite.vendorAccountName` / `vendorGroupName` | DB | what the vendor tree said |
| `groupInfo` | Retail v2 | `[{name, groups[{id, parentId, name}]}]` — top-level `name` is the account = the customer |
| `groupInfo` | **Mall v1** (`/api/v1/base/groupInfo`) | flat `[{id, pid, name, name_en}]` — a different shape for the same idea |
| `plazaInfo.groupName` | Retail | present on only ~36% of sites |

Sites with no group are only attributable through the vendor portal's account switcher. Roughly 70 Retail
sites are still unassigned — see `docs/PROJECT_STATE.md` → "Camera Monitor module".

## 7. Picking a sample site for testing

Use one you know has live data, otherwise you will "verify" an endpoint against an empty result:

```bash
docker exec ditech-planner-postgres-1 psql -U ditech -d ditech_planner -c \
 "SELECT s.source, s.\"plazaUnid\", s.\"plazaName\", count(*) FILTER (WHERE d.\"currentStatus\"=1) AS online
    FROM \"MonitoredSite\" s LEFT JOIN \"MonitoredDevice\" d ON d.\"siteId\"=s.id
   GROUP BY 1,2,3 ORDER BY online DESC LIMIT 10;"
```

On Mall, `SVB` has by far the most of everything. On Retail, `Central World` has devices, 7 gates and 10
zones, which is enough to exercise every Retail endpoint. `backend/scripts/vion-probe.ts` starts from those
two and falls back to the next candidate automatically if one has gone quiet.
