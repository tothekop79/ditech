# Task: Event Report v2 — ดึง rawdata จาก Vion API ตามตารางเวลา → generate → ส่ง Telegram (ไม่ต้องอัปโหลดไฟล์)

## Context

Repo `/home/ditech/ditech-planner` (branch `main`) — อ่านก่อนเริ่ม:
- `docs/PROJECT_STATE.md` ทั้ง section Event Reports + Lessons #28, #48, #51, #58, #60, #67, #68, #69, #71
- `backend/src/services/eventReport.service.ts`, `rawdataFiles.service.ts`, `rawdataNormalizer.service.ts`, `queues/eventReport.queue.ts`
- `backend/src/integrations/vion/vion.client.ts` + `deviceMonitor.service.ts` (Camera Monitor ใช้ Vion API อยู่แล้ว — reuse ห้ามเขียน client ใหม่)
- `docs/VION_API_VERIFIED.md` — verified API catalog **38 endpoints × 2 servers** + `docs/vion-probe-results.json`
  (probe script `backend/scripts/vion-probe.ts`, CLI `backend/scripts/vion.ts`)
- `backend/python-engine/dashboard_engine.py` เฉพาะ `COL_NAMES` และ `build_config()` เพื่อรู้ว่า engine คาดหวังคอลัมน์อะไร

**ปัจจุบัน:** ผู้ใช้ export `CaptureRecordsDetails-*.xlsx` จาก Vion ด้วยมือ (วันละไฟล์) → อัปโหลด → backend merge เป็น `Rawdata.xlsx` + `_config` sheet → spawn Python engine → HTML/XLSX → Telegram แจ้ง "report ready" พร้อมลิงก์

**เป้าหมาย v2:** ตั้งค่า event ครั้งเดียว (server Mall/Retail + plazaId + เวลาดึง) → ระบบดึงข้อมูลเองตามเวลา → generate เอง → ส่งไฟล์รายงานเข้า Telegram เอง ผู้ใช้ไม่ต้องแตะอะไรระหว่างงาน

## หลักการออกแบบ (ห้ามเบี่ยง)

1. **ผลิตไฟล์ให้เหมือน uploader ทุกประการ** — service ใหม่ต้องเขียน `source/CaptureRecordsDetails-YYYY-MM-DD.xlsx` ที่มีคอลัมน์/ลำดับ/ชนิดข้อมูลตรงกับไฟล์ export จาก Vion เป๊ะ แล้วปล่อยให้ pipeline เดิม (merge → `_config` → engine → snapshot → Telegram) ทำงานต่อโดย**ไม่แก้ engine, ไม่แก้ merge, ไม่แก้ normalizer** (lesson #48 — engine เป็น file-in/file-out ต้องรักษาไว้)
2. **Credentials ของ Vion อยู่ใน env เท่านั้น** (ตัวเดียวกับ Camera Monitor) ไม่เก็บใน DB ไม่มีช่องกรอกใน UI — UI เลือกแค่ server + plazaId
3. **Upload mode เดิมต้องยังใช้ได้เหมือนเดิม** — v2 เป็น data source ทางเลือก ไม่ใช่การแทนที่ event ที่มีอยู่ทั้ง 3 ตัว (ALSTOM, SHIN RAMYUN, ฯลฯ) ต้อง generate ได้เหมือนเดิมหลัง deploy
4. เวลา: **ห้ามแปลง timezone** — `captureRecord.counttimeLocal` เป็น site-local อยู่แล้ว เขียนลงไฟล์ตรง ๆ
   (แก้เมื่อ 2026-09-18 หลัง Step 0: ข้อเดิมสั่งแปลงจาก GMT+8 ซึ่งผิด — พิสูจน์แล้วว่า `counttimeLocal`
   ตรงกับคอลัมน์ `Time` ในไฟล์ manual แบบ string ต่อ string ทั้ง 41,538 แถวที่ join ได้ ถ้าแปลงจะเพี้ยน 1 ชั่วโมง
   `modifyTime` ต่างหากที่เป็น GMT+8 แต่ `captureRecord` ไม่คืน field นั้น)
   แต่ **ต้องตัดตามเวลาทำการของ event** (`displayHoursStart`–`displayHoursEnd`, inclusive ทั้งสองปลาย)
   เพราะไฟล์ export ของผู้ใช้ถูกตัดด้วยหน้าต่างนี้ — ถ้าไม่ตัด ตัวเลข unique/traffic จะพองทุกตัว
5. งานดึงข้อมูลต้องรันใน BullMQ worker ที่ตั้ง `lockDuration` / `maxStalledCount: 0` แบบเดียวกับ eventReport (lesson #71) และเขียนไฟล์แบบ streaming (ExcelJS `stream.xlsx.WorkbookWriter`) — ห้าม buffer ทั้ง response ใน memory (lesson #68: OOM loop เกิดจากแบบนี้)

---

## Step 0 — Feasibility gate (ต้องผ่านก่อนเขียนโค้ดใด ๆ)

จาก `docs/VION_API_VERIFIED.md` หา endpoint ที่คืน **capture records รายเหตุการณ์** (ระดับ BodyID + เวลา + location/gate + event in/out + customerType + อายุ/เพศ) ทั้ง Mall และ Retail server แล้ว:

1. ใช้ vion CLI / probe script ที่มีอยู่ ดึงข้อมูล 1 plaza 1 ชั่วโมงจริง จาก**ทั้งสอง server**
2. เทียบ field ที่ได้กับ `COL_NAMES` ใน engine และกับไฟล์ `CaptureRecordsDetails-*.xlsx` จริงใน `backend/uploads/events/<eventId>/source/` ของ event ที่มีอยู่ — ทำตาราง mapping ทีละคอลัมน์: มี / ต้อง derive / ไม่มี
3. ตรวจ pagination, page size สูงสุด, rate limit, และว่าดึงย้อนหลังได้กี่วัน
4. วัดเวลาดึง 1 วันของ plaza ที่ traffic สูง (เช่น SVB) — ใช้ประเมิน timeout

**รายงานผลแล้วหยุด** ถ้าคอลัมน์ที่ engine ต้องใช้ตัวใดตัวหนึ่ง "ไม่มี" และ derive ไม่ได้ → v2 ทำไม่ได้ในรูปแบบนี้ ต้องตัดสินใจใหม่ ห้ามเดา ห้าม stub ค่าว่างแล้วไปต่อ

## ข้อจำกัด retention ที่ยืนยันแล้ว (Step 0, 2026-09-18)

`captureRecord` เก็บย้อนหลัง **~7 วันต่อ plaza** (SVB 09-12→09-18, Xtool 09-10→09-16, วันก่อนหน้า = 0 แถว)
ดึงย้อนหลังเกินนั้นไม่ได้ถาวร จึงออกแบบรับดังนี้:
- เลือก VION → `fetchSchedule` เป็น field **บังคับ** default `23:30` ตาม `fetchTz` · บันทึกไม่ได้ถ้าว่าง (Step 2/3)
- บันทึก data source ครั้งแรก → enqueue ดึงทุกวันที่ยังอยู่ใน retention ทันที
- job รายวันดึง **D-1 และ D-2 แบบ force overwrite ทุกครั้ง** (รับ ReID backfill) วันเก่ากว่านั้น skip ถ้ามีไฟล์แล้ว
- UI แสดง "ข้อมูลใน Vion เหลือถึงวันที่ (วันนี้−7)"
- จดเป็น lesson ใน PROJECT_STATE ตอน Step 5

## Step 1 — Fetch service + CLI (ยังไม่มี UI, ยังไม่มี schedule)

- `backend/src/services/vionRawdata.service.ts`
  - `fetchDay({server, plazaId, date, tz}) → Promise<{rows, filePath}>` — ดึงทุกหน้า, แปลงเวลา, เขียน `CaptureRecordsDetails-YYYY-MM-DD.xlsx` ลง `source/` ของ event แบบ streaming
  - `probePlaza({server, plazaId}) → {plazaName, deviceCount, gates[], firstSeen}` สำหรับปุ่ม "ทดสอบการเชื่อมต่อ"
  - ถ้าไฟล์ของวันนั้นมีอยู่แล้วและ `force=false` ให้ข้าม (idempotent — schedule รันซ้ำต้องไม่ทำไฟล์ซ้ำ)
- `backend/scripts/vion-fetch-day.ts` — CLI: `--event <id> --date YYYY-MM-DD [--force]` เรียก service เดียวกัน
- Schema (Prisma): เพิ่มใน `Event`: `dataSource` (`UPLOAD` | `VION`, default `UPLOAD`), `vionServer` (`MALL` | `RETAIL` | null), `vionPlazaId` (String?) — **ยังไม่ต้องใส่ schedule fields ใน step นี้**
  - ใช้วิธี migrate ตามที่ repo ใช้อยู่จริง (ตรวจ `ls prisma/migrations/` + PROJECT_STATE ว่าปัจจุบัน `migrate dev` หรือ `db push`) และ `sudo chown -R ditech:ditech backend/prisma/migrations/` ทันทีหลังสร้าง (lesson #58)
- เพิ่ม env ที่ต้องใช้ใน `environment:` ของ `docker-compose.yml` ไม่ใช่แค่ `.env` (lesson #67) แล้ว `docker compose up -d backend` + `restart frontend` (lesson #69)

**Verify (ต้องมีตารางเทียบ):** เลือก plaza + วันที่ที่มีไฟล์ `CaptureRecordsDetails` ที่ผู้ใช้ export ด้วยมืออยู่แล้ว (ถามผู้ใช้ว่าใช้ event ไหน) รัน CLI ให้ได้ไฟล์จาก API แล้วเทียบ:
- จำนวนแถว, จำนวน unique BodyID, จำนวนต่อ Location, min/max timestamp, สัดส่วน CustomerType — ต้องตรงกันหรืออธิบายผลต่างได้ทุกบรรทัด
- **คอลัมน์ที่ derive (`CustomerType` / `AgeGroup` / `Gender` / `Event`) ต้องตรงกับไฟล์ manual เป็น string 100%**
  (`excludeStaff` และ dwell pairing พึ่ง literal `'Staff'` / `'in'` / `'out'` — ผิดตัวเดียวตัวเลขเพี้ยนเงียบ ๆ)
- เอาไฟล์จาก API ไปแทนไฟล์ manual ใน event ทดสอบ (สำเนา event ใหม่ ห้ามแตะ event จริง) → generate → เทียบ KPI ใน Dashboard.html กับรายงานเดิม
- `tsc --noEmit` backend ไม่มี error ใหม่จาก baseline 10

Commit: `feat(event): Vion API rawdata fetch service + CLI (data source VION)`

## Step 2 — API + UI ตั้งค่า data source

Backend (`event.routes.ts` / `event.service.ts`):
- `PATCH /api/events/:id` whitelist `dataSource, vionServer, vionPlazaId` (lesson #29: Zod + service whitelist ทั้งคู่)
- `POST /api/events/:id/vion/probe` → เรียก `probePlaza`
- `POST /api/events/:id/vion/fetch` body `{dates?: string[], force?: boolean}` → enqueue fetch job (ค่าเริ่มต้น = ทุกวันของ event ตั้งแต่ startDate ถึง min(endDate, วันนี้))
- `GET /api/events/:id/vion/fetches` → ประวัติการดึง (ตาราง `EventFetchRun`: eventId, date, status QUEUED/RUNNING/COMPLETED/FAILED, rows, durationMs, errorMessage, triggeredBy `MANUAL|SCHEDULE`)
- Queue ใหม่ `eventFetch.queue.ts` concurrency 1, lockDuration/maxStalledCount ตาม lesson #71, timeout จาก env `VION_FETCH_TIMEOUT_MS` (default คำนวณจากผลวัด step 0 × 1.5)

Frontend (`EventConfigEditor.tsx` — เพิ่ม section ใหม่ `📡 แหล่งข้อมูล` เหนือ Analytics Parameters, style ตาม UI kit Phase 1):
- radio: **อัปโหลดไฟล์ (เดิม)** / **ดึงจาก Vion อัตโนมัติ**
- เมื่อเลือก Vion: select server (Mall `mall.vion-cloud.com` / Retail `retail.vionyun.com`) · input plazaId · ปุ่ม **ทดสอบการเชื่อมต่อ** → แสดง plazaName, จำนวนกล้อง, รายชื่อ gate (ใช้ตรวจว่า gate ใน Event config ตรงกับชื่อ Location จริง — ถ้าไม่ตรง engine จะไม่รู้จัก Entrance)
- ปุ่ม **ดึงข้อมูลตอนนี้** (เลือกวันได้) + ตารางประวัติการดึง auto-poll ทุก 3 วิ ขณะ QUEUED/RUNNING (pattern เดียวกับ `ReportsList.tsx`)
- `RawdataFilesPanel` แสดงไฟล์ที่มาจาก API ด้วย badge `API` แยกจาก `Upload` (เพิ่มคอลัมน์ `source` ในตารางไฟล์ ถ้ายังไม่มี)
- `verifyRawdata` ต้องเห็นไฟล์จาก API เป็น source file ปกติ (lesson #62 — verify ต้องใช้ predicate เดียวกับ generate)

Verify: ตั้ง event ทดสอบเป็น VION → probe เห็นชื่อ plaza → กดดึง 2 วัน → ไฟล์โผล่ใน panel → Generate เปิดใช้ได้ → report ออก KPI ตรงกับ step 1 · event เดิมแบบ UPLOAD ยัง generate ได้

Commit: `feat(event): Vion data source config UI + fetch API + fetch history`

## Step 3 — Schedule

- Schema เพิ่มใน `Event`: `fetchSchedule` (String? cron 5 ช่อง เช่น `30 23 * * *`), `fetchTz` (default `Asia/Bangkok`), `autoGenerate` (Bool default true), `autoSendRuleId` (String? → NotificationRule)
- BullMQ repeatable job ต่อ event (`pattern` + `tz` — BullMQ 5.76 ใช้ `pattern` ไม่ใช่ `cron`)
  · **jobId = `event-fetch--<eventId>`** (BullMQ ห้าม `:` ใน custom id — `"Custom Id cannot contain :"`)
  · **ใช้ `upsertJobScheduler` / `removeJobScheduler` / `getJobSchedulers` ไม่ใช่ `getRepeatableJobs`**
    (แก้เมื่อ 2026-09-18 ตอน Step 3: `getRepeatableJobs()` ไม่คืน jobId ที่เราตั้ง — `key` เป็น hash
    ทึบ หา repeatable จาก id ที่ add ไว้ไม่เจอ ลบตัวเก่าไม่ออก เกิด key ซ้อนสองตัวตอนเปลี่ยนเวลา
    ส่วน Job Scheduler API คีย์ด้วย id ที่เราตั้งเอง และ upsert ทับ pattern เดิมให้ในตัว)
  · ตอน backend boot ให้ sync จาก DB (event ที่ `dataSource=VION` และ `fetchSchedule` ไม่ว่าง และวันนี้ ≤ endDate + 1)
  · **flag ปิด → ลบ scheduler ทิ้งทั้งหมด** (ปิดแล้วต้องไม่เหลือ key ค้างใน redis)
- Flow ของ job: ดึงวันที่ยังไม่มีไฟล์ (ปกติ = เมื่อวาน ถ้ารันหลังเที่ยงคืน) → ถ้า `autoGenerate` enqueue report ผ่าน `enqueueReport()` เดิม → ผลต่อไปเป็น pipeline เดิม
- UI: ใน section แหล่งข้อมูล เพิ่ม **ดึงอัตโนมัติทุกวันเวลา** (time picker → แปลงเป็น cron, แสดง "ครั้งถัดไป: …" คำนวณจาก pattern) · toggle generate อัตโนมัติ · select rule Telegram สำหรับส่ง
- หลัง endDate ผ่านไป 1 วัน job ต้องหยุดเอง (ไม่ดึงว่างเปล่าทุกวันตลอดไป)

Verify: ตั้งเวลา 3 นาทีข้างหน้า → รอ → `EventFetchRun` มีแถว `SCHEDULE` → report ถูก enqueue → `redis-cli` เห็น repeatable key เดียวต่อ event · เปลี่ยนเวลา → key เก่าหาย · restart backend → job ยังอยู่

Commit: `feat(event): scheduled Vion fetch + auto-generate (BullMQ repeatable)`

## Step 4 — ส่งรายงานเข้า Telegram เป็นไฟล์

ปัจจุบัน `dispatchEventReportReady()` ส่งข้อความ + ลิงก์ ให้เพิ่ม:
- ถ้า rule มี `sendFile=true` (field ใหม่ใน `NotificationRule`, default false) → หลังข้อความ ส่ง PDF ผ่าน `sendDocument` (Telegram limit 50 MB — ถ้า PDF ใหญ่กว่า ส่งลิงก์แทนและบันทึก warning)
- PDF: ถ้า engine/pipeline ยังไม่ผลิต PDF ให้ใช้ Puppeteer ที่มีอยู่ (`pdf.service.ts`) render `Dashboard.html` ของ report นั้น → `reports/<reportId>/Dashboard.pdf` · ใช้ `@page` ที่ engine กำหนดไว้ ห้ามแก้ CSS print ใน engine (lesson #11, #61)
- caption: ชื่อ event · วันที่ข้อมูลล่าสุด · profile · จำนวนวันที่มีข้อมูล / ทั้งหมด
- UI: ใน Notification rules เพิ่ม toggle "แนบไฟล์ PDF"

Verify: report จริง 1 ตัวส่งเข้ากลุ่มทดสอบ (ไม่ใช่กลุ่มลูกค้า) เปิด PDF ได้ทุกหน้า · rule ที่ไม่เปิด sendFile ยังได้ข้อความแบบเดิม

Commit: `feat(telegram): send report PDF as document (per-rule opt-in)`

## Step 5 — ปิดงาน

- `docs/PROJECT_STATE.md`: section "Event Report v2 — Vion data source" (architecture diagram แบบ ASCII เหมือน excludeStaff, ไฟล์ใหม่, env ใหม่, ตาราง mapping คอลัมน์จาก step 0, ข้อจำกัดที่พบ) + lessons ใหม่ต่อจากเลขล่าสุดในไฟล์ (ดูของจริง ห้ามเดา)
- `docs/VION_API_VERIFIED.md` เพิ่ม endpoint ที่ใช้ + ตัวอย่าง response 1 แถว (ปิดบัง BodyID)
- merge `--no-ff` เข้า main + push + restart + ยืนยัน /health และ generate ของ event เดิมยังทำงาน

---

## Rules

### v2 ต้องอยู่คู่กับ v1 ไม่ทับ (กฎบังคับทุก step)
- ทุก event ที่มีอยู่ต้องยัง `dataSource=UPLOAD` และ generate ได้เหมือนเดิม — **เป็นข้อ verify บังคับทุก step**
- v2 = ไฟล์ใหม่เท่านั้น (`vionRawdata.service`, `eventFetch.queue`, `EventFetchRun`, routes `/vion/*`)
  ไฟล์เดิมที่ต้องแตะ (`event.service`, `event.routes`, `EventConfigEditor`, `RawdataFilesPanel`)
  แก้แบบ**เพิ่ม branch ใหม่เท่านั้น** ห้ามเปลี่ยน logic ของ path UPLOAD แม้แต่บรรทัดเดียว
  รายงาน `git diff` ของไฟล์เดิมเหล่านี้ทุก commit ให้ดูว่าเป็น + ล้วน
- feature flag `EVENT_V2_ENABLED` (compose `environment:`, default `false` บน prod จนกว่าจะปิด Step 5)
  ปิด → UI ไม่แสดงตัวเลือก VION, scheduler ไม่ sync repeatable jobs, route `/vion/*` ตอบ 404
- schema ใหม่ทุก field ต้องมี default หรือ nullable — ห้าม field ที่ทำให้ row เดิม invalid

### ทั่วไป
- ทำงานบน branch `feat/event-report-v2` · หนึ่ง step หนึ่ง commit · `git add <path>` ระบุ · อ่าน `git status` ก่อน commit · **หยุดรอ review หลังทุก step** (step 0 หยุดหลังรายงานผลแม้จะผ่าน)
- ห้ามแก้ `dashboard_engine.py`, `rawdataFiles.service.ts`, `rawdataNormalizer.service.ts` — ถ้าพบว่า "ต้องแก้" ให้รายงานพร้อมเหตุผลแล้วรอ ไม่แก้เอง
- ห้าม commit credentials, plazaId ของลูกค้าจริงในไฟล์ test/fixture, หรือ raw data ตัวอย่างที่มี BodyID จริง
- Python atomic patch / TS: ไม่มี `as any` ใหม่ · `tsc --noEmit` ทั้ง backend และ frontend ก่อนทุก commit เทียบ baseline (FE 28 / BE 10 ณ Sep 17)
- ทุก timeout เป็น env var มี default และ error message แสดงค่าจริง (lesson #60)
- restart backend หลังทุก patch (lesson #28) · `up -d backend` เมื่อแตะ compose แล้ว restart frontend (lesson #69)
- ถ้า reality ≠ PROJECT_STATE (ชื่อไฟล์, endpoint, โครง queue) เชื่อ reality รายงานความต่างแล้วทำต่อ
- รายงานท้าย step: ไฟล์ + บรรทัด, commit hash, ตาราง verify, สิ่งที่ผิดจากที่คาด

## Out of scope

Multi-plaza ต่อ event, ดึง POS/ยอดขาย, retry policy ซับซ้อน (ใช้ BullMQ attempts 3 backoff exponential พอ), LINE Notify, แก้ engine ใด ๆ, redesign รายงาน (เป็นงานแยก)
