# Task: Restyle ditech-planner frontend ให้เป็น DITECH Retail Intelligence design system (Phase 1)

## Context

Repo: `/home/ditech/ditech-planner` (branch `main`, HEAD ≈ `7cb681e`). Frontend อยู่ที่ `frontend/` — Vite + React + TypeScript + Tailwind + TanStack Query. รันใน Docker (`ditech-planner-frontend-1`, port 3000).

อ่านก่อนเริ่ม: `docs/PROJECT_STATE.md` (โดยเฉพาะ Lessons #11, #14, #20, #36, #56) และ `frontend/tailwind.config.*`, `frontend/src/index.css`, `frontend/src/App.tsx`, component ที่ทำหน้าที่เป็น `Layout` / top nav.

**เป้าหมาย:** เปลี่ยน look & feel ทั้ง platform ให้ตรงกับ mockup "เส้นทางลูกค้าในร้าน" (Club21 Retail Intelligence dashboard) โดย **ไม่แตะ backend, API, hooks, Prisma, business logic ใด ๆ** — งานนี้เป็น presentation layer ล้วน

Phase 1 นี้ทำ 4 step และหยุดรอ review หลังแต่ละ step:
1. Design tokens + fonts
2. App shell (top nav)
3. UI kit 6 components
4. Migrate หน้า **Plans** เป็น pilot page

ห้ามทำ step ถัดไปจนกว่าจะ commit step ปัจจุบันและรายงานผลแล้ว

---

## Design spec (จาก mockup)

### Palette
| token | ค่า | ใช้กับ |
|---|---|---|
| `ditech.navy` | `#213153` | **สีจากโลโก้** — top bar, headings, ตัวเลข KPI, dark cells |
| `ditech.navy-light` | `#2C4170` | hover / secondary dark |
| `ditech.gold` | `#FFD200` | **สีจากโลโก้ (TM tag)** — active-nav indicator, notification badge, focus ring เท่านั้น (สีสว่างมาก ห้ามใช้เป็นพื้นใหญ่หรือตัวหนังสือบนขาว) |
| `ditech.gold-deep` | `#C9A24D` | ใช้แทน gold บนพื้นขาว: highlight row, "ซื้อ/บิล" chart series, note box border |
| `ditech.gold-soft` | `#FFF6C2` | highlight background (แถวที่เลือก, note box) |
| `surface.page` | `#F6F7F9` | พื้นหลังหน้า |
| `surface.card` | `#FFFFFF` | card |
| `surface.border` | `#E5E7EB` | ขอบ card / เส้นตาราง |
| `ink.primary` | `#213153` | ข้อความหลัก |
| `ink.secondary` | `#6B7280` | label เล็ก, subtitle |
| `ink.muted` | `#9CA3AF` | hint, footnote |
| `positive` | `#16A34A` | delta ▲, MET |
| `negative` | `#DC2626` | delta ▼, error |
| `warning` | `#D97706` | in-progress, pending |
| `scale.1..5` | `#DDF3E8` → `#A9E1C4` → `#5CC79A` → `#22A36F` → `#0F6B47` | heatmap / intensity 5 ระดับ |

Status pills (พื้นอ่อน + ตัวหนังสือเข้ม tone เดียวกัน, rounded-full, text-xs, font-medium):
- COMPLETED → `bg-emerald-50 text-emerald-700`
- IN PROGRESS → `bg-amber-50 text-amber-700`
- DRAFT → `bg-slate-100 text-slate-600`
- CONFIRMED → `bg-blue-50 text-blue-700`
- CANCELLED → `bg-red-50 text-red-700`
- READY → `bg-emerald-50 text-emerald-700` / PENDING → `bg-slate-100 text-slate-600`

ต้องอ่านออกแม้พิมพ์ขาวดำ → ใช้ทั้งสี + ข้อความ ห้ามใช้สีอย่างเดียว

### Typography
- Font: `"IBM Plex Sans Thai", "Sarabun", system-ui, sans-serif` (โหลดจาก Google Fonts ใน `index.html` — ถ้า network ใน container ไม่ถึง fonts.googleapis ให้ใช้ Sarabun ที่มีอยู่แล้วสำหรับ PDF)
- หัวข้อหน้า: `text-xl font-bold text-ink-primary` + subtitle บรรทัดล่าง `text-sm text-ink-secondary`
- KPI label: `text-xs text-ink-secondary` / KPI value: `text-2xl font-bold text-ditech-navy tabular-nums` / delta: `text-xs` + ▲▼
- ตาราง: header `text-xs uppercase tracking-wide text-ink-secondary bg-surface-page`, body `text-sm`, ตัวเลขชิดขวา `tabular-nums`

### Shape
- Card: `bg-surface-card border border-surface-border rounded-xl shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5`
- Pill/Chip: `rounded-full px-2.5 py-0.5`
- Button primary: `bg-ditech-navy text-white rounded-lg`; secondary: `border border-surface-border bg-white`
- Radius มาตรฐาน `rounded-lg` (input, button) / `rounded-xl` (card)
- ไม่มี gradient, ไม่มี shadow หนัก

---

## Step 1 — Tokens + fonts

1. `frontend/tailwind.config.*` → `theme.extend.colors` เพิ่ม tokens ข้างบน (nested: `ditech`, `surface`, `ink`, `scale`, และ flat `positive`/`negative`/`warning`). **extend เท่านั้น** ห้าม override palette เดิม เพราะโค้ดเก่ายังใช้ `blue-600`, `green-100` ฯลฯ อยู่
2. `theme.extend.fontFamily.sans` = stack ข้างบน
3. `index.html` โหลดฟอนต์; `index.css` ตั้ง `body { @apply bg-surface-page text-ink-primary; }`
4. สร้าง `frontend/src/theme/tokens.ts` export ค่าสี hex เดียวกันเป็น JS object — สำหรับ react-konva, recharts, และ `FunctionColorSet` ที่ต้องใช้ค่าสีตรง ๆ ไม่ใช่ class (ยังไม่ต้องไป wire เข้า canvas ใน phase นี้ แค่ให้มี source of truth เดียว)

Verify: `npx tsc --noEmit` ไม่มี error ใหม่ (error เดิม ~20 ตัวใน PlanEditModal/useDesignEditor/CalendarPage ยอมรับได้ — lesson #56), หน้าเว็บทุกหน้ายังเปิดได้ พื้นหลังเปลี่ยนเป็น off-white และฟอนต์เปลี่ยน

Commit: `feat(ui): add DITECH design tokens + Thai font stack`

## Step 2 — App shell (top bar)

Reference: `topbar-preview.html` + `logo_ditech_white.png` + `logo_ditech_navy.png` (แนบมาด้วย — เปิดดูก่อนเขียนโค้ด แล้วทำให้เหมือน) สร้าง `frontend/src/components/layout/TopBar.tsx` แล้วให้ `Layout` ใช้แทน nav เดิม

**โครง (ซ้าย → ขวา) สูง 60px, พื้น `bg-ditech-navy`, `border-b border-white/[.08]`, ไม่มี shadow ไม่มี gradient, padding-x 20px**

1. **Brand block** — ใช้โลโก้จริง: วางไฟล์ `logo_ditech_white.png` (ขาว+เหลือง TM บนพื้นใส สำหรับ top bar) และ `logo_ditech_navy.png` (สำหรับพื้นขาว/PDF) ที่ `frontend/public/brand/` แล้ว `<img src="/brand/logo_ditech_white.png" alt="DITECH" class="h-6 w-auto">` · ขวาของโลโก้คั่นด้วยเส้นตั้ง `border-l border-white/[.08]` แล้วข้อความ `Installation Planner` (`text-[11.5px] text-white/[.72]`) · ทั้ง block คั่นจาก nav ด้วย `border-r border-white/[.08]` สูง 36px · **ห้ามพิมพ์คำว่า DITECH เป็น text ซ้ำกับโลโก้**
2. **Primary nav** — text-only ไม่มีไอคอน, `text-[13.5px] font-medium text-white/70`, hover `text-white bg-white/[.06]`, **active = `text-white font-semibold` + เส้นทอง 2px ชิดขอบล่างของ bar** (`absolute bottom-0 h-0.5 bg-ditech-gold` กว้างเท่าข้อความ) — ไม่ใช้ pill พื้นขาวแบบเดิม
   - แสดงตรง ๆ: Calendar, Plans, Events, Designs, Gantt, Map, Reports, Camera Monitor
   - **More ▾** dropdown: Command, Wall, Settings (dropdown ขาว `rounded-[10px] border shadow-lg`, item `text-[13.5px]`, มี hint เทาด้านขวาได้ เช่น "ops console")
   - Plans แสดง count pill เล็ก `bg-white/[.14] text-[10.5px] rounded-full` ถ้า count มีอยู่ใน state แล้ว (ห้ามเพิ่ม API call เพื่อเอา count)
   - ต่ำกว่า `lg` (1024px) ยุบ nav ทั้งหมดเป็น hamburger เปิด drawer/sheet
3. **spacer**
4. **Global search** — ปุ่มหน้าตาเป็น input `h-[34px] min-w-[230px] rounded-lg border border-white/[.14] bg-white/[.05] text-white/60` placeholder "ค้นหาสาขา, ลูกค้า, แผน…" + `kbd ⌘K` ขวา · phase นี้กดแล้ว focus ไปช่อง search ของหน้า Plans (หรือ navigate ไป `/plans` แล้ว focus) ยังไม่ต้องทำ command palette · ซ่อนต่ำกว่า `xl`
5. **LIVE + clock** — pill `border border-white/[.14] rounded-lg h-[34px]`: จุดเขียว 8px มี ring pulse (`@keyframes` + `prefers-reduced-motion: reduce` → ปิด animation) · `LIVE` `text-[12.5px] font-semibold tracking-wide` · เส้นคั่น · นาฬิกา `tabular-nums text-white/65` · ใช้ health state เดิมที่ component เก่าใช้อยู่ ถ้า backend ไม่ตอบ → จุดแดง + ข้อความ `OFFLINE`
6. **Notification bell** — `icon-btn 34px rounded-lg`, badge ทอง `bg-ditech-gold text-ditech-navy text-[10px] font-bold` ขอบ navy 2px มุมขวาบน · phase นี้ badge อ่านจาก state ที่มีอยู่แล้วเท่านั้น ถ้ายังไม่มี notification store ให้ render ปุ่มโดยไม่มี badge (ห้าม hardcode เลข)
7. **User menu** — avatar 28px `rounded-[7px]` initials 2 ตัว พื้น `from-[#3D5384] to-[#2C4170]` · ชื่อ `text-[12.5px] font-semibold` / role · team `text-[10.5px] text-white/55` · chevron · dropdown: ส่วนหัว (ชื่อ + email) / โปรไฟล์ / ตั้งค่าการแจ้งเตือน / Settings / แถว `Environment prod · host` และ `Version v1.0 · <short sha>` (อ่านจาก `import.meta.env` ถ้ามี ถ้าไม่มีให้ซ่อนแถวนั้น) / ออกจากระบบ (แดง) · ต่ำกว่า `lg` เหลือแค่ avatar

**Behaviour / a11y**
- dropdown ทุกตัว: ปิดเมื่อคลิกนอก, กด `Esc`, และเมื่อ route เปลี่ยน · มี `aria-haspopup="menu"` + `aria-expanded`
- ทุกปุ่ม/ลิงก์มี `focus-visible:outline-2 outline-ditech-gold outline-offset-[-2px]`
- ใช้ `NavLink` ของ react-router สำหรับ active state ห้ามเทียบ `pathname` มือ
- **ห้ามเปลี่ยน route, ห้ามตัด nav item, ห้ามเปลี่ยนลำดับ** — Command/Wall/Settings แค่ย้ายเข้า More ยังเข้าถึงได้ทุกตัว
- ไม่เพิ่ม dependency: ไอคอน (search, bell, chevron, hamburger) ใช้ inline SVG หรือ `lucide-react` ถ้ามีอยู่ใน `package.json` แล้วเท่านั้น

Verify:
- ทุก route กดได้เหมือนเดิม รวม 3 ตัวใน More
- `/gantt/print` ยังอยู่นอก Layout และไม่มี top bar (ตรวจใน `App.tsx`)
- ย่อ browser เหลือ 900px → nav ยุบเป็น hamburger เปิด/ปิดได้, กว้าง 1440px → เหมือน preview
- screenshot 3 รูป: desktop default, More + user menu เปิด, 900px

Commit: `feat(ui): enterprise top bar — brand mark, gold active indicator, search, live status, user menu`

## Step 3 — UI kit

สร้าง `frontend/src/components/ui/` 6 ไฟล์ (แต่ละไฟล์ export default 1 component, typed props, ไม่มี `any`):

| ไฟล์ | props หลัก | หมายเหตุ |
|---|---|---|
| `Card.tsx` | `title?`, `subtitle?`, `action?` (ReactNode), `children`, `className?` | header row มี title ซ้าย action ขวา |
| `KpiCard.tsx` | `label`, `value` (string \| number), `delta?` ({ value: number; suffix?: string }), `hint?`, `tone?: 'default'\|'positive'\|'negative'` | delta > 0 แสดง ▲ เขียว, < 0 ▼ แดง, = 0 ไม่แสดง |
| `Pill.tsx` | `tone: 'success'\|'warning'\|'neutral'\|'info'\|'danger'`, `children`, `size?: 'sm'\|'md'` | ใช้เป็น status / region / filter chip |
| `PageHeader.tsx` | `title`, `subtitle?`, `actions?` | ใช้ทุกหน้าแทน `<h1>` แบบ ad-hoc |
| `FilterBar.tsx` | `children`, `onReset?` | flex-wrap container สำหรับ select/search; ให้ style input/select ภายในผ่าน CSS class `.ui-input` ที่ประกาศใน `index.css` |
| `DataTable.tsx` | `columns: Column<T>[]`, `rows: T[]`, `rowKey`, `density?: 'compact'\|'comfortable'` (default `compact`), `onRowClick?`, `emptyText?` | `Column<T> = { key, header, align?: 'left'\|'right'\|'center', width?, render?: (row) => ReactNode }`; header sticky; row hover `bg-surface-page` |

เพิ่ม `frontend/src/components/ui/index.ts` re-export ทั้งหมด

Verify: สร้างหน้า dev-only `/ui-kit` (ลงทะเบียน route เฉพาะ `import.meta.env.DEV`) แสดง component ทุกตัวพร้อม props หลายแบบ เปิดดูแล้วถ่าย screenshot แนบมาในรายงาน

Commit: `feat(ui): add UI kit (Card, KpiCard, Pill, PageHeader, FilterBar, DataTable)`

## Step 4 — Pilot: หน้า Plans

หาไฟล์หน้า Plans ก่อน (`grep -rln "All Plans" frontend/src/pages`) แล้ว:

1. แทน header ด้วย `PageHeader` title `All Plans · {total}` subtitle เป็นช่วงวันที่ที่ filter อยู่
2. เพิ่มแถว `KpiCard` 5 ใบใต้ header: **Total / Completed / In progress / Draft / Pending readiness** — คำนวณจาก data ที่ list มีอยู่แล้ว **ห้ามเพิ่ม API call ใหม่** ถ้าตัวเลขต้องมาจาก server ให้ใช้ค่าที่ response มี ถ้าไม่มีให้แสดงจาก rows ที่โหลดมาและใส่ hint "จากรายการที่โหลด"
3. ย้าย filter row เข้า `FilterBar` — select/search ทุกตัวเดิม, logic เดิม, query param เดิม
4. ย้ายตารางเข้า `DataTable` density `compact` — คอลัมน์เดิมทั้งหมด (#, SCHEDULED, CUSTOMER, DEPARTMENT, BRANCH, REGION, PROVINCE, TEAM, SENSORS, STATUS, READINESS, actions), sort เดิม, checkbox เดิม, link ไป plan detail เดิม
5. STATUS / READINESS / REGION → `Pill` ตาม mapping ข้างบน; BRANCH link เปลี่ยนจาก `text-blue-600` เป็น `text-ditech-navy font-medium hover:underline`
6. pagination (`limit: 1000` — lesson #33 ห้ามเปลี่ยนเป็น pageSize) และ "Page X of Y" คงเดิม

**Do not touch:** `plansApi.list` call, query keys, `PlanEditModal`, การคำนวณ readiness, GanttPage, PrintGanttPage, `print-gantt.css`, ทุกไฟล์ใน `components/coverage/`

Verify:
- 173 plans โหลดครบ (เทียบ count ก่อน/หลัง — ถ่าย screenshot ทั้งสองแบบ)
- filter ทุกตัวยังทำงาน, sort ยังทำงาน, checkbox + bulk action ยังทำงาน
- `npx tsc --noEmit` ไม่มี error ใหม่
- `docker compose restart frontend` แล้วเปิดใหม่ (lesson #69)

Commit: `feat(plans): migrate Plans page to new UI kit (pilot)`

---

## Rules (ต้องทำตามทุกข้อ)

- **Verify before patch:** `git status` สะอาดก่อนเริ่มแต่ละ step, `git log --oneline -3` ตรวจ HEAD, `wc -l` ไฟล์ที่จะแก้
- **หนึ่ง step = หนึ่ง commit** ใช้ `git add <path>` ระบุไฟล์ ห้าม `git add .` / `git add -A` และอ่าน `git status` หลัง add ทุกครั้ง — ถ้า "Changes to be committed" ว่าง ห้าม commit
- ไม่แก้ backend, ไม่แก้ `prisma/`, ไม่แก้ `python-engine/`, ไม่แก้ `backend/templates/`
- ไม่แก้ `@media print` ใด ๆ (lesson #11) และไม่แตะ `utils/dateColor.ts` (lesson #36)
- ไม่ใส่ `(x as any)` ใหม่ ถ้าเจอ type ไม่ตรง ให้แก้ที่ type หรือรายงาน ไม่ cast ข้าม
- ไม่เพิ่ม dependency ใหม่ (ไม่ต้องใช้ shadcn/headless UI — Tailwind ล้วน)
- ทำงานเสร็จแต่ละ step → รายงาน: ไฟล์ที่แก้ + จำนวนบรรทัด, commit hash, screenshot, สิ่งที่พบว่าผิดจากที่คาด แล้ว **หยุดรอ**
- ถ้าเจอว่า reality ≠ PROJECT_STATE.md (ชื่อไฟล์, โครงสร้าง Layout ไม่ตรง) ให้เชื่อ reality รายงานความต่าง แล้วทำต่อ — ไม่ต้องหยุดถามเว้นแต่กระทบ scope

## Out of scope (ไว้ Phase 2 — ห้ามทำในรอบนี้)

Events, Camera Monitor, Reports, Calendar, Designs (react-konva colors), Gantt screen colors, Handlebars PDF templates, Dashboard.html จาก Python engine, dark mode
