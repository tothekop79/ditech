# DITECH Installation Planner — Current State (May 14, 2026)

## 📌 TL;DR

- ✅ **System WORKING** — backend healthy, frontend + DB + Redis + Telegram all green
- ✅ **C1.x coverage suite COMPLETE through C1.10f** — verified end-to-end May 14
- ✅ **Batch 1 (May 13–14) shipped 10 commits** — sensor cache fix, ratio override, tilt sync, cone CCTV mode, collapsible KPI bar, migration baseline squash, Gantt UX polish
- ✅ **Prisma migrations rebaselined** — single baseline covers all 25 tables
- ✅ **Gantt UX polish (May 14 afternoon, commit `571ba09`)** — Date Color Banding (left-side only), Date Group Header per date, always-visible work time, pagination silent regression hotfix
- ⏭️ **Next**: Commit 5 (label visibility + draggable labels) closes Batch 1; then C1.10d#4 (Near/Far ratio UX), C1.11 (IN/OUT arrows), C2 (export PDF/PNG + polygon zones)
- ⏭️ **Branch state**: `fix/sensor-cache-merge` is 11 commits ahead of `main` (`5aa19bc`). PR/merge pending.

Latest commit: `571ba09` "feat(gantt): date color banding + group header + work time + pagination fix"

## Stack & Server

- **Server:** root@ditech-planer (192.168.1.120), user `ditech`
- **Path:** `/home/ditech/ditech-planner`
- **GitHub:** https://github.com/tothekop79/ditech.git
- **Containers (all up):** `ditech-planner-backend-1`, `ditech-planner-frontend-1`, `postgres`, `redis`
- **Backend:** Node.js + Express + Prisma 5 + PostgreSQL + Redis + BullMQ. Port 5000. Entry `src/server.ts`, tsx watch
- **Frontend:** Vite + React + TypeScript + Tailwind + react-konva@18 + konva@9. Port 3000
- **PDF gen:** Puppeteer-core + Chromium 147 + Handlebars + Sarabun (Google Font)
- **Health endpoint:** `http://localhost:5000/health` → `{status:ok, db:ok, redis:ok, telegram:configured}`
- **Test creds:** `admin@ditech.co.th` / `Admin123!`

## Git history (recent)

```
571ba09  feat(gantt): date color banding + group header + work time + pagination fix  ← HEAD = origin/fix/sensor-cache-merge
0732195  chore: ignore backups folder
7d04799  feat(designs): C1.10f collapsible KPI summary bar
3f71770  feat(designs): C1.10e cone coverage mode for CCTV
161066c  fix(designs): unify tilt input across SensorSettingsPanel + ObstructionPanel
f0fd845  feat(designs): C1.10d#3 advanced trapezoid ratio override
829e202  chore: squash Prisma migrations into baseline                            ← Batch 1 (May 13–14)
08aad6f  chore: track Prisma migrations in git
7296ca3  chore: align frontend UpdateSensorDTO with backend Zod
c33180f  fix(designs): reset sensor coverage to model defaults
98190de  fix(designs): isolate sensor update mutations per field
5aa19bc  docs: refresh git history block with C1.10b/c commits                   ← origin/main, ↑ Batch 1 above
a8ce7d9  fix(C1.10c): backend accepts color + display flag + coverageMode fields
b1c76c4  fix(C1.10b): complete SensorTransformLayer migration to dynamic_tilt
599014f  docs: log C1.10b session + 5 lessons learned
eb78d34  feat(C1.10b): replace anchor dropdown with read-only policy badge
6f692c0  feat(C1.10b): unify coverage geometry with dynamic tilt anchor
15ec4b8  feat(C1.10b): collapse anchorMode to policy enum 'center' | 'dynamic_tilt'
881bcb0  docs: log May 13 housekeeping session + 2 new lessons
0daff27  chore: remove tracked .bak files + tighten .gitignore pattern
1ef37e8  feat(gantt-print): add legend row + clamp range to today
b6143be  docs: relocate PROJECT_STATE.md to docs/ + refresh for May 13 audit
fa1ae31  fix(gantt): use 'limit' instead of 'pageSize' (pagination)
6885145  feat(print): dedicated /gantt/print route, semantic table
9833fd3  chore: remove tracked .bak files, ignore future backups          (incomplete — see lesson #12)
870f484  feat(gantt): complete UX overhaul + frontend pagination fix
5383aee  fix(calendar): align week labels with day cells (single grid)
4f7ebb8  feat(date-filter): Next 7/30/90 days presets
7e7d209  fix(backend): raise pagination cap 100 → 1000
5547cfe  feat(gantt): executive redesign — KPI cards + sticky timeline + PDF export
8ec8acd  feat(C1.9):  tilt projection — recompute on tilt/mode change       ← C1.x re-applies start
3e46aaa  feat(C1.8):  whitelist coverage display fields in sensor update()
4d42078  feat(C1.10): allow 'near_edge' anchor mode in Zod validation
55b00b2  fix: restore service + validation files that were truncated         ← old project_state HEAD
babbb65  restore: recover designs.ts + useDesignEditor.ts (were 0 bytes)
ffd74f0  fix: don't ignore frontend coverage components folder
6e7f223  feat: C1.8-C1.10 coverage rendering + tilt + anchor (truncated)
ca64b71  chore(backend): add sharp dep
2f16774  feat(coverage): C1.1 + C1.2 schema + backend CRUD APIs              ← recovery base
```

## Verified file inventory (May 13 audit — host == container)

### Backend
```
src/services/installationDesign.service.ts      591 lines
src/middlewares/installationDesign.validation.ts 124 lines   anchorModeEnum has 4 values incl. 'near_edge'
src/utils/tiltProjection.ts                     128 lines   TILT_RATIO_TABLE + applyTiltProjection()
prisma/schema.prisma                            (current — all C1.x columns present, see below)
```

### Frontend — `src/components/coverage/` (14 files, 4337 lines total)
```
CameraModelsModal.tsx         145
CoverageRectLayer.tsx         363   4-case geometry (rect|tilt × center|near_edge)
CoverageSummaryBar.tsx        286
DesignCanvas.tsx              320
FloorPlanLayer.tsx             70
MeasureTool.tsx               297
ObstructionPanel.tsx          952
SensorListPanel.tsx           153
SensorMarkerLayer.tsx         231   marker icons + labels at -53px
SensorSettingsPanel.tsx       568   anchor dropdown, tilt slider, display toggles
SensorTransformLayer.tsx      228
ZoneLayer.tsx                 109
```
Plus: `api/designs.ts` 226, `hooks/useDesignEditor.ts` 389 (merge-on-success cache pattern)

### Schema — SensorPlacement fields (C1.x additions)
```prisma
tiltAngle          Float    @default(0)         // pitch tilt for bracket mount
coverageWidth      Float                        // m (= farWidth when tilt_projection)
coverageDepth      Float                        // m
anchorMode         String   @default("center")  // center | back_edge | front_edge | near_edge
nearEdgeRatio      Float    @default(0.47)      // near/far ratio for tilt trapezoid
coverageMode       String   @default("rectangle")  // rectangle | tilt_projection | cone (C1.10e)
showLabels         Boolean  @default(true)
showDimensions     Boolean  @default(true)
showDirectionArrow Boolean  @default(true)
// C1.10d#3 — Manual trapezoid ratio override (tilt_projection only)
ratioOverride      Boolean  @default(false)
farWidthRatio      Float?                          // multiplier 0.1-3.0, nullable
depthRatio         Float?                          // multiplier 0.1-3.5, nullable
```

## C1.x Coverage Suite — DONE ✅

### C1.10 — `near_edge` anchor (commit `4d42078`)
Zod `anchorModeEnum` now: `['center', 'back_edge', 'front_edge', 'near_edge']`.
Frontend Sensor Position dropdown for tilt_bracket no longer 400s.

### C1.10d#1 — Isolate sensor update mutations (commit `98190de`)
Fixed two related bugs causing `mountingHeight` snap-back:
1. Debounce timers were keyed by `sensorId` only → ObstructionPanel's redundant PATCH cancelled the user's mountingHeight PATCH. Fix: key by `sensorId + sorted(dto.keys)`.
2. `onSuccess` merged the FULL server response → DB still held old value → overwrote user's optimistic update. Fix: merge only fields that were in the dto, plus server-recomputed coverageWidth/coverageDepth/nearEdgeRatio when mountingHeight/tiltAngle/coverageMode/cameraModelId changed.

### C1.10d#2 — Reset to model defaults (commit `c33180f`)
"↺ Reset to Model Defaults" button (always visible). Sends `{coverageOverride: false, recomputeCoverage: true}`. New transient `recomputeCoverage` flag — never persisted, just triggers service-layer recompute.

### C1.10d#3 — Manual trapezoid ratio override (commit `f0fd845`)
3 new SensorPlacement columns: `ratioOverride`, `farWidthRatio`, `depthRatio`. When `ratioOverride=true` AND `coverageMode='tilt_projection'`, service bypasses tilt lookup: `width = base.W * farWidthRatio`, `depth = base.D * depthRatio`. Mode-change safety: switching away from tilt_projection auto-clears `ratioOverride` but keeps ratio values. UI: Basic/Advanced toggle (localStorage `ditech-designer-advanced-mode`).

### C1.10d#3.5 — Unify tilt inputs (commit `161066c`)
Fixed SensorSettingsPanel tilt edits being overwritten by stale ObstructionPanel local state. Added prop→state resync useEffect. ObstructionPanel slider max 60→45 to align with backend TILT_MAX=45.

### C1.10e — Cone coverage mode for CCTV (commit `3f71770`)
Third `coverageMode` value: isosceles triangle, apex at sensor, base of `coverageWidth` at distance `coverageDepth`. No migration (String enum, lesson #32). Cone forces `anchorY=0`. Labels: 'Base Xm' + 'Depth Xm'.

### C1.10f — Collapsible KPI summary bar (commit `7d04799`)
Chevron toggle in CoverageSummaryBar. Collapsed state via localStorage `ditech-designer-kpi-collapsed`.

### Gantt UX — Date Color Banding + Group Header (commit `571ba09`, May 14 afternoon)

New shared util `frontend/src/utils/dateColor.ts` (70 lines) used by BOTH `GanttPage.tsx` and `PrintGanttPage.tsx`:
- 7-color soft pastel palette (blue, emerald, amber, purple, cyan, rose, indigo)
- `dateKey(d)` returns YYYY-MM-DD
- `buildDateColorMap()` is deterministic by sorted-date index
- Dates with NO plans get NO color

**Date Color Banding scope = LEFT SIDE ONLY** (most important design rule):
- ✅ Date badge: filled muted palette.bg + colored palette.border + dark text
- ✅ Date Group Header: full pastel band + 4px colored left border
- ❌ Plan row background: pure white
- ❌ Timeline columns: NO tint
- ❌ Gantt bars: completely unchanged

**Date Badge** — 3-line stack (46px): day-num (17px extrabold) / MONTH (8px) / DOW (8px).

**Date Group Header** — `Fri 15 May  [3 plans]` before first plan of each date.

**Work time always visible** — `🕐 22:00–02:00` or `🕐 Time: —` (italic fallback). LEFT_CUSTOMER widened 160 to 200px.

**Bar alignment safety**: bars positioned per-row, not per-group. See lesson #37.

**Pagination hotfix in same commit**: GanttPage was using `{ pageSize: 500 }` but backend uses `limit`. Plans like Terminal 21 Asok and Central Westgate silently dropped. Fixed to `{ limit: 1000 }`. See lesson #33.

Files: `GanttPage.tsx` (1370), `PrintGanttPage.tsx` (639), `print-gantt.css` (444), `utils/dateColor.ts` (70 NEW).

### C1.8 — Coverage display field whitelist (commit `3e46aaa`)
`sensor.update()` now accepts and persists 4 fields previously silent-dropped:
`coverageMode`, `showLabels`, `showDimensions`, `showDirectionArrow`.
Insertion point: `installationDesign.service.ts` lines 473–476 (after `'status' in data`).

### C1.9 — Tilt projection (commit `8ec8acd`)
`tiltProjection.ts` (128 lines) with `TILT_RATIO_TABLE` + linear interpolation + clamp [0,45].
`computeCoverageForSensor()` extended to 4 args:
`(cameraModelId, mountingHeight, coverageMode, tiltAngle)` returning `{width, depth, nearEdgeRatio?}`.
Recompute trigger now reacts to `tiltChanged || modeChanged` (in addition to model/height).
Storage convention: `coverageWidth = farWidth`, `nearEdgeRatio = nearWidth/farWidth`.

Tilt ratio table (linear interpolation between rows, clamp [0°, 45°]):
```
tilt | nearW  | farW   | depth
  0° | 1.00x  | 1.00x  | 1.00x
 15° | 0.80x  | 1.05x  | 1.20x
 30° | 0.55x  | 1.10x  | 1.55x
 45° | 0.40x  | 1.20x  | 1.90x
```
E2E verified May 11 commit notes: G6 @ 3.5m base 12×3.5 → tilt 30° gives 6.6m near × 13.2m far × 5.4m depth.

### Geometry — 5 cases frontend handles:
```
(rectangle,        center)     sensor at CENTER, symmetric rect
(rectangle,        near_edge)  rect projects forward, sensor at back
(tilt_projection,  near_edge)  trapezoid forward, narrow at sensor   ← default for tilt_bracket
(tilt_projection,  center)     trapezoid centered, sensor at centroid
(cone,             apex)       isosceles triangle, sensor IS apex    ← CCTV (C1.10e)
```

When `ratioOverride=true` AND `coverageMode='tilt_projection'` (C1.10d#3), the
service bypasses the tilt lookup table and uses `farWidth = baseWidth × farWidthRatio`,
`depth = baseDepth × depthRatio`. Mode change away from `tilt_projection` auto-clears
`ratioOverride` (ratios themselves remain in DB).

### Defaults (encoded in `SensorSettingsPanel.tsx`):
- `embedded` / `surface` → coverageMode = `rectangle`, anchor = `center` (read-only)
- `bracket` → `rectangle`, anchor = `center` (editable to `near_edge`)
- `tilt_bracket` → `tilt_projection`, anchor = `near_edge` (editable to `center`)

## 🖨️ Print / Export PDF (commits `6885145` + `1ef37e8`, May 12–13 2026)

### What works
- `/gantt/print` dedicated route renders Gantt as semantic `<table>`
- Browser-native `<thead>` repeat on every page (no JS hacks)
- `<tfoot>` repeats footer on every page
- Page header (DITECH + Date Range + Generated) repeats
- KPI strip repeats on every page
- Month/Week/Day rows repeat on every page
- Group header (e.g. *BKK TEAM 2 · 20 plans · 49 sensors*) stays with first row
- Plan rows do not split across pages (`page-break-inside: avoid`)
- Legend row at end of table (STATUS chips + REGION swatches), `page-break-inside: avoid`
- Range start clamps to today (no wasted columns showing past days)
- App nav/sidebar hidden in print
- Print button in `GanttPage` opens `/gantt/print?...` in new tab

### Files
- `frontend/src/pages/PrintGanttPage.tsx` (563 lines, +36 in `1ef37e8`)
- `frontend/src/pages/print-gantt.css` (367 lines, +67 in `1ef37e8`)
- `frontend/src/pages/GanttPage.tsx` — `handlePrint` opens new tab
- `frontend/src/App.tsx` — `/gantt/print` route registered OUTSIDE the `Layout` wrapper
- Removed (`1ef37e8`): obsolete `frontend/src/pages/gantt-print.css` (187 lines, superseded)

### 🚨 Critical lesson — do NOT repeat this mistake

**Do NOT override widths or font-sizes inside `@media print`.**

When you change column widths or font-sizes in print rules, Chrome's print engine
RE-LAYOUTS the entire table and collapses narrow columns to slivers (each character
ends up on its own line).

The fix that finally worked: keep `@media print` minimal — only hide app chrome
and remove shadows. Let screen widths/sizes pass through to print unchanged. Chrome
scales the page to A4 automatically.

### URL examples
```
/gantt/print?from=2026-05-11&to=2026-06-10&group=team
/gantt/print?from=2026-05-01&to=2026-05-31&group=customer&region=BANGKOK
```

### Test procedure
1. Navigate to `/gantt`
2. Click **Print** button → new tab opens
3. Print dialog appears after ~600ms
4. Save as PDF

## What works (verified May 13)

- ✅ `GET/POST/PATCH/DELETE /api/designs` + sensors + zones
- ✅ Floor plan upload + image-dim detection (sharp)
- ✅ Sensor CRUD: drag, edit all fields incl. coverageMode/showFlags
- ✅ Tilt slider → backend recomputes trapezoid (tested via curl: 200 + correct dims)
- ✅ Anchor dropdown → `near_edge` accepted, persisted, rendered
- ✅ **mountingHeight no longer snaps back** (C1.10d#1, commit `98190de`)
- ✅ **Reset to Model Defaults button** recomputes coverage from spec (C1.10d#2)
- ✅ **Advanced trapezoid ratio override** (C1.10d#3) — manual multipliers
- ✅ **Cone coverage mode** for CCTV (C1.10e)
- ✅ **Collapsible KPI summary bar** (C1.10f)
- ✅ **Tilt input unified** (C1.10d#3.5)
- ✅ **Prisma migrations rebaselined** — clean baseline restored
- ✅ **Gantt Date Color Banding + Group Header** (commit `571ba09`)
- ✅ **Gantt pagination** — loads up to 1000 plans (verified: DB has 120)
- ✅ Photos, communication logs, status history
- ✅ Document generation (Work Permit, Installation Confirm) — Handlebars + Puppeteer
- ✅ Gantt page (executive redesign + print route)
- ✅ Calendar view with week-label alignment
- ✅ Telegram notifications configured

## Pending

### Branch merge
`fix/sensor-cache-merge` is **11 commits ahead** of `main`. PR/merge pending.

### Commit 5 of Batch 1
**feat: label visibility + draggable labels** — 3 new columns (`showCoverage`, `labelOffsetX`, `labelOffsetY`), Konva drag handlers, UI toggle.

### C1.10d#4 (deferred from May 13)
Trapezoid Near/Far ratio UX decision. Bugs #1-#3 closed. #4 reclassified as UX gap.

### Other tech debt (rolled over)
- ObstructionPanel still fires redundant PATCHes on mountingHeight keystroke
- `FunctionColorSet` missing icon/text/tint fields (TS2339)
- `NodeJS` namespace import missing in `useDesignEditor.ts:68`
- `(s as any).coverageMode` casts remain in `SensorSettingsPanel.tsx`
- Server-local `.git/info/exclude` blocks `*.sql` — need `git add -f`

## Roadmap

### Priority 1 — Coverage UX next
- **C1.10b** ✅ — Anchor as continuous function of tilt (replaces near_edge enum value)
- **C1.10c** ✅ — Zod + whitelist for color / coverageMode / showLabels / showDimensions
                  / showDirectionArrow / nearEdgeRatio (fixed UI snap-back for these 6 fields)
- **C1.10d** ⏭️ NEXT — Fix remaining cache/recompute issues (4 known bugs, see below)
- **C1.11** — IN/OUT arrows for Entrance counting line (visual direction indicator)
- **C1.12** — Multi-sensor label auto de-clutter (avoid overlapping `-53px` labels)

#### C1.10d — Known bugs to fix
1. **`mountingHeight` snap-back in browser** (curl PATCH persists OK; frontend cache discards).
   Likely `useDesignEditor.ts` merge-on-success pattern doesn't include the recomputed
   `coverageWidth` / `coverageDepth` fields that backend returns when height changes.
2. **`coverageDepth` doesn't recompute when `coverageMode` changes via API**
   (rectangle ↔ tilt_projection). Recompute trigger fires (logged) but `coverageOverride`
   may be `true` and short-circuiting it. Audit `coverageOverride` lifecycle:
   when is it set, when reset.
3. **`anchorMode` in DB doesn't auto-update when `coverageMode` changes.**
   Frontend derives the policy in UI but doesn't push the derived value back to backend.
   Either push from FE or recompute on backend in the same place coverage is recomputed.
4. **Trapezoid Near/Far ratio input only moves the Near edge.**
   Likely a UX expectation gap, not a code bug — backend stores `nearEdgeRatio` =
   nearWidth/farWidth, and `farWidth` is recomputed from `tilt + base`. Decide:
   should Far be independently editable, or is "near/far ratio" the right knob at all?

Additional tech debt (gluing onto C1.10d):
- `UpdateSensorDTO` in `frontend/src/api/designs.ts` missing `color`, `coverageMode`,
  `nearEdgeRatio`, `showLabels`, `showDimensions`, `showDirectionArrow` (currently uses
  `(s as any)` casts in 3 places). Now that backend Zod accepts them, frontend type can
  finally include them too.
- `FunctionColorSet` missing `icon` / `text` / `tint` fields used in `SensorListPanel`
  + `SensorSettingsPanel` (TS2339).
- `NodeJS` namespace import missing in `useDesignEditor.ts:68`.

### Priority 2 — Export / editing
- **C2.1** — Export PDF/PNG of floor plan with sensors + zones overlay
- **C2.2** — Polygon edit handles for zones (currently rectangle only? verify ZoneLayer)

### Priority 3 — Reports & analytics
- Reports redesign (KPI cards + recharts)
- Equipment master table (dropdown for `sensorModel`/`poeSwitchModel`)
- Dashboard map (Google Maps pins per branch with status color)

### Priority 4 — Workflow modules
- Mobile checklist module (tablet-friendly Installer view)
- Notification rules UI (email/LINE beyond current Telegram)
- Document workflow: DRAFT → FINALIZED → SIGNED with signature capture

## 🚨 LESSONS LEARNED

### From May 11 session (file truncation recovery)
1. **`.gitignore` catch-all `coverage/`** silently ignored every coverage component for entire C1.x.
   Fix: `/coverage/` + `backend/coverage/` + `frontend/coverage/` (commit `ffd74f0`).
   Always run `git check-ignore -v <path>` if `git add` doesn't add expected files.

2. **`docker cp` can truncate to 0 bytes** when tsx-watch / vite-watch reloads concurrently.
   Mitigation: write to `/tmp` first, `wc -l` verify, then `docker cp`. ALWAYS `wc -l` after.

3. **Regex patches fail silently** when pattern doesn't match. Prefer direct `str.replace()` with
   exact text from `grep -A` output. Dry-run on mock file first when regex is unavoidable.

4. **TanStack Query `onSuccess: invalidateQueries` causes cache snap-back** if backend strips
   fields. Already mitigated in `useDesignEditor.ts` (merge-into-cache pattern).

5. **Backend `update()` uses explicit field whitelist** at `installationDesign.service.ts`
   lines 456–476. Adding a new sensor field = +1 line in that block (per field).

6. **Frontend container has NO python3** — use sh + node for patches.

7. **Schema patches**: brace-walking, not `[^}]*` regex (fails on nested braces).
   Always `npx prisma validate` after.

### From May 13 session (audit-before-patch)
8. **Project state files go stale fast.** `_PROJECT_STATE.md` (May 11 evening) was already
   outdated by ~30 min: C1.8/C1.9/C1.10 were committed later that night without state update.
   The May 13 plan was to "re-apply C1.10" — but C1.10 was already on git.
   **Rule**: always `git log --oneline -20` + `wc -l <file>` + container parity check
   BEFORE trusting any "current state" doc. Verify reality first, plan second.

9. **No-op commits hide real changes.** When `git add <file>` produces no diff vs HEAD,
   the next `git commit` may pick up *other* uncommitted/staged work and push that under
   your commit message. After May 13 "C1.10 re-apply": `git add` returned silent (file already
   matched HEAD), then `git commit` packaged unrelated Gantt mod as `fa1ae31` and pushed it.
   **Rule**: after `git add`, ALWAYS read `git status` output — if "Changes to be committed"
   section is empty, do NOT proceed to `git commit`.

10. **A pristine pre-state check costs almost nothing.** Adding 3 lines of grep + wc
    before any patch caught the "already applied" case in <10 seconds, saving from
    overwriting working code with a duplicate commit.

### From May 12 session (print/export work)
11. **`@media print` should ONLY hide app chrome — never restyle widths or font-sizes.**
    Overriding column widths or font-sizes inside `@media print` triggers Chrome's print
    engine to re-layout the entire table, often collapsing narrow columns to character-per-line
    slivers. Keep print rules minimal (hide nav, remove shadows). Let screen styles pass
    through unchanged — Chrome scales to A4 automatically. See Print/Export PDF section above.

### From May 13 session (housekeeping)
12. **`.gitignore` does NOT support inline comments.** Writing
    `*.bak.*    # catch *.bak.intent style` is parsed as a single pattern of the entire
    line including the `#` and comment text — it matches nothing. Comments must be on
    their own line. Always verify a new rule with `git check-ignore -v <sample-path>`
    immediately after adding it. Caught in commit `0daff27` after `*.bak.*` rule silently
    no-op'd; fixed by moving the comment to its own line above the pattern.

13. **`git rm --cached` is what `chore: remove tracked .bak files` should have been.**
    Commit `9833fd3` claimed to "remove tracked .bak files and ignore future backups"
    but only updated `.gitignore` — the 7 tracked `.bak` files survived in git index
    from initial commit `e71ad57` until they were finally removed in `0daff27` on May 13.
    Lesson: when a commit title says "remove tracked X", run `git ls-files | grep X`
    afterward to verify. `.gitignore` rules apply only to *untracked* files.

### From May 13 evening session (C1.10b — anchor as continuous tilt function)
14. **Type drift is silent under `as any` casts.** `frontend/src/api/designs.ts`
    had `AnchorMode = 'center' | 'back_edge' | 'front_edge'` while
    `CoverageRectLayer.tsx` declared its own local `AnchorMode = 'center' | 'near_edge'`
    and `SensorSettingsPanel.tsx` used `'near_edge'` literals. All bypassed the canonical
    type via `(s as any).anchorMode`. Backend Zod was the only honest source of truth.
    Lesson: when a feature commit adds a new union member, `grep -n "type FooMode"`
    across the whole frontend on the same day. `(x as any)` is a deferred bug, not a fix.

15. **`docker exec wc -l < /app/...` redirects on host, not container.**
    The `<` is parsed by the host shell before docker runs. When parity-checking,
    use `docker exec <c> md5sum /app/<f>` (no redirect) or `docker exec <c> sh -c 'wc -l /app/<f>'`.

16. **DB defaults to user `postgres`; this project uses `ditech`.** Stock `psql -U postgres`
    fails with FATAL no-role. Always grep `docker-compose.yml` or `pg_dump` for
    POSTGRES_USER before running data-audit queries.

17. **"Patch without commit" is a real state.** Two earlier `python3` patches + `docker cp`
    successfully modified disk + container but the user never ran `git commit`.
    The next session opened with `git status` showing 1-file dirty working tree and
    no AnchorMode commit anywhere in the log. Worked out fine because the patches
    were dead-ends, but it could just as easily have looked like the work was lost.
    Lesson: end every patch sequence with `git log --oneline -3` and confirm the
    expected hash is at HEAD before moving on.

18. **Continuous-anchor formula is cleaner than enum branching.** 4-case `if/else`
    on (coverageMode × anchorMode) collapsed to ONE polygon-shift formula:
        anchorY = (depth/2) * (1 - clamp(tilt/45, 0, 1))
    File `CoverageRectLayer.tsx` shrank from 363 → ~295 lines without losing any
    user-visible behaviour. Whenever an enum has values that interpolate, suspect
    that the enum is the wrong abstraction.

### From May 13 late session (C1.10b + C1.10c — anchor redesign + Zod gap fix)

19. **`200 OK` is not proof of save with default Zod.** A `z.object({...})` schema
    strips unknown keys silently and the API returns `success: true` because the
    *recognised* part succeeded. Service-layer field whitelists run AFTER Zod,
    so a field missing from Zod will never reach them no matter how many `if ('x' in data)`
    branches exist. Always assert the response echoes the field the request sent,
    not just the status code. Caught during C1.10b smoke testing when `color`,
    `coverageMode`, `showLabels`, `showDimensions`, `showDirectionArrow`, and
    `nearEdgeRatio` were all returning success but never persisting. Fixed in
    `installationDesign.validation.ts` (commit `a8ce7d9`).

20. **Type drift is silent under `as any` casts.** Canonical `AnchorMode` in
    `api/designs.ts` had `'back_edge' | 'front_edge'` while `CoverageRectLayer`
    declared its own local `'center' | 'near_edge'` and `SensorSettingsPanel`
    used `'near_edge'` literals — all bypassing canonical via `(s as any).anchorMode`.
    Backend Zod was the only honest source of truth. When a feature commit adds
    a new union member, `grep -n "type FooMode"` across the whole frontend the
    same day. `(x as any)` is a deferred bug, not a fix.

21. **`docker exec wc -l < /app/...` redirects on the host, not in the container.**
    The `<` is parsed by the host shell before docker runs. When parity-checking,
    use `docker exec <c> md5sum /app/<f>` (no redirect) or
    `docker exec <c> sh -c 'wc -l /app/<f>'`. Burned ~10 minutes in the C1.10b
    session before figuring this out — and ironically lesson #15 had just been
    written warning about exactly this trap.

22. **DB defaults to user `postgres`; this project uses `ditech`.** Stock
    `psql -U postgres` fails with FATAL no-role. Always
    `grep POSTGRES_USER docker-compose.yml` before running data-audit queries.

23. **"Patch without commit" is a real state.** A python heredoc + docker cp can
    successfully modify disk + container without producing a git commit if the
    operator forgets the final `git commit`. The next session opened with a
    dirty working tree containing a stale, dead-end patch. End every patch
    sequence with `git log --oneline -3` and confirm the expected hash is at
    HEAD before moving on. Worked out fine this time because the patch was a
    dead-end, but could have looked like work was lost.

24. **Continuous formula > enum branching.** 4-case `if/else` on
    (coverageMode × anchorMode) collapsed to ONE polygon-shift formula:
        anchorY = (depth/2) * (1 - clamp(tilt/45, 0, 1))
    `CoverageRectLayer.tsx` shrank from 363 → ~295 lines without losing any
    user-visible behaviour. Whenever an enum has values that interpolate,
    suspect that the enum is the wrong abstraction.

25. **Multi-line `str_replace` patterns can mismatch over a single missing
    blank line.** A python heredoc `str_replace` with an exact 6-line pattern
    failed because the file had a blank line between two of those lines that
    the pattern did not include. The assert said 0 matches; the operator
    didn't re-check and ran `docker cp` + `git commit` on a half-patched file.
    Lesson: prefer single-line `str_replace` or content-anchored line-slicing
    over multi-line exact-text patterns. If multi-line is unavoidable,
    `xxd` the source bytes to see exactly what's between your anchor lines.

### From May 13–14 (Batch 1: C1.10d/e/f)

26. **Git ignores stack from multiple sources.** `.gitignore`, `.git/info/exclude`, `core.excludesfile` all stack. Server's `.git/info/exclude` blocks `*.sql`. Always `git check-ignore -v <file>` after edit. (Commits `08aad6f` + `829e202`)

27. **`prisma migrate status "up to date"` ≠ schema-DB sync.** It only verifies `_prisma_migrations` matches disk files, NOT that migrations describe actual DB. After `db push` workflows, init migration may miss tables. Use `prisma migrate diff --from-migrations --to-schema-datasource`. (Commit `829e202`)

28. **tsx watch HMR in Docker bind mount is unreliable for backend.** chokidar misses events under bind mount; Node holds stale modules. Force `docker compose restart backend` after every backend patch. (Commit `f0fd845`)

29. **Zod field addition alone does not persist.** Adding to Zod makes it validate, but field never reaches Prisma unless service-layer whitelist also has it. `grep -n "in data) updateData"`. (Commit `f0fd845`)

30. **Two components editing same value need prop to state resync.** When A's local state initialized from `props.X` but B changes the prop, A stays stale. Fix: `useEffect(() => { if (prop !== local) setLocal(prop); }, [prop])`. (Commit `161066c`)

31. **UI ranges must match backend constraints.** ObstructionPanel slider max=60 vs backend TILT_MAX=45 — values > 45 had no effect but appeared editable. (Commit `161066c`)

32. **String enums safer than Postgres enums for fast iteration.** `coverageMode = String` made adding 'cone' zero-migration. Postgres enums need `ALTER TYPE ADD VALUE`. (Commit `3f71770`)

### From May 14 afternoon (Gantt UX + pagination)

33. **Pagination param regression silent across re-deploys.** `fa1ae31` fixed pageSize→limit. Later refactor re-introduced pageSize. Bug invisible until DB plan count > 50. `diff <(grep plansApi.list a) <(grep plansApi.list b)` catches drift. (Commit `571ba09`)

34. **Plan missing diagnostic order: SQL first, UI last.** (1) SELECT WHERE → (2) SELECT COUNT → (3) curl API → (4) Browser Network → (5) UI code last. May 14 nearly rolled back UI before SQL proved data intact.

35. **Prisma tables = PascalCase singular + quoted camelCase.** Always `\dt` first. `"InstallationPlan"` not `plans`.

36. **Date Color Banding must be LEFT side only.** Tinting timeline columns or row backgrounds turns schedule into calendar app. Palette to badge + group header only.

37. **Bar alignment survives row-injection IF bars are position-per-row.** `barLeft = startIdx * DAY_W` is row-relative, not group-relative. Header rows above don't shift bar columns.

38. **Make it more professional = strip backgrounds, keep borders.** Polish loop: full pastel band → header-only → white+border (too subtle) → filled muted badge + pastel header (final). When user says too playful, strip row-level fills; keep palette on small chrome.

## File location quick-reference

### Backend
- `src/services/installationDesign.service.ts` (591) — main service. Sensor update whitelist at ~L456–476.
  `computeCoverageForSensor()` at L50. Recompute trigger block at L478–497.
- `src/middlewares/installationDesign.validation.ts` (124) — Zod schemas. `anchorModeEnum` at L60.
- `src/middlewares/validation.middleware.ts` — generic `validate()` factory.
- `src/routes/installationDesign.routes.ts` — routes wire schema + service.
- `src/utils/cameraCoverage.ts` — base `interpolateCoverage()`.
- `src/utils/tiltProjection.ts` (128) — `TILT_RATIO_TABLE` + `applyTiltProjection()` + interpolation.
- `prisma/schema.prisma` — SensorPlacement has all C1.x columns (see Schema section above).

### Frontend
- `src/api/designs.ts` (226) — CoverageMode + AnchorMode types incl. `near_edge`
- `src/hooks/useDesignEditor.ts` (389) — merge-on-success pattern (lines ~64)
- `src/components/coverage/*.tsx` — 14 files, see inventory above

### Document generation (stable, untouched May 11+)
- `src/services/document.service.ts`, `pdf.service.ts`, `document-defaults.ts`
- Templates: `templates/work-permit.html`, `templates/installation-confirm.html`

## Recovery pattern (if files get truncated again)

```bash
cd /home/ditech/ditech-planner

# 1. Find 0-byte source files
docker exec ditech-planner-backend-1 sh -c \
  'find /app/src -name "*.ts" | while read f; do
     s=$(wc -l < "$f"); [ "$s" -lt 5 ] && echo "$f: $s lines";
   done'

# 2. Restore from known-good commit
git log --oneline -- <broken-file>
git show <commit>:<broken-file> > /tmp/restored.ts
wc -l /tmp/restored.ts            # MUST be > 0

# 3. Copy back (sudo for host)
sudo cp /tmp/restored.ts <host-path>
sudo chown ditech:docker <host-path>
docker cp /tmp/restored.ts <container>:<app-path>

# 4. Parity check
wc -l <host-path> && docker exec <container> wc -l <app-path>

# 5. Test via API + commit immediately
```

## Useful one-liners

```bash
# Health
curl -s http://localhost:5000/health | jq .

# Backend log tail
docker compose logs -f backend --tail=20

# 0-byte scan
docker exec ditech-planner-backend-1 sh -c \
  'find /app/src -name "*.ts" | while read f; do
     s=$(wc -l < "$f"); [ "$s" -lt 5 ] && echo "$f: $s";
   done'

# Container vs host parity for a file
diff <(wc -l <host-path>) <(docker exec ditech-planner-backend-1 wc -l <app-path>)

# Quick auth + curl helper
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ditech.co.th","password":"Admin123!"}' | jq -r .data.token)
curl -s http://localhost:5000/api/designs -H "Authorization: Bearer $TOKEN" | jq .
```

## Key principles for future patches

1. **Verify before patching** — `wc -l`, `grep`, `git log` first. If reality ≠ doc, trust reality.
2. **One feature at a time** — easier to bisect, easier to roll back.
3. **Commit before patching** — rollback = `git checkout HEAD -- <file>`.
4. **No batch deploys** — never `docker cp` multiple files without verifying each.
5. **Direct string replacement > regex** when grep output of actual code is available.
6. **Read `git status` after `git add`** — empty "Changes to be committed" = stop, do not commit.
7. **Always `npx prisma validate`** after schema edits.
8. **Update `_PROJECT_STATE.md` AT END of every session** — even short ones. Stale docs cost real time.
9. **Verify `.gitignore` rules with `git check-ignore -v`** after every edit. Patterns that look right may silently no-op.
