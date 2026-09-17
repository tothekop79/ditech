import { useState } from 'react';
import { Card, KpiCard, Pill, PageHeader, FilterBar, DataTable, type Column } from '../components/ui';

/**
 * Dev-only gallery for the UI kit. Registered in App.tsx behind `import.meta.env.DEV`
 * so it never appears in a production build's route table.
 */

interface DemoRow {
  id: string;
  branch: string;
  region: string;
  sensors: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  readiness: 'READY' | 'PENDING';
}

const ROWS: DemoRow[] = [
  { id: '1', branch: 'Central Westgate',    region: 'BANGKOK', sensors: 12, status: 'COMPLETED',   readiness: 'READY' },
  { id: '2', branch: 'Robinson Suvarnabhumi', region: 'BANGKOK', sensors: 1,  status: 'IN_PROGRESS', readiness: 'PENDING' },
  { id: '3', branch: 'Nongkai',             region: 'UPC',     sensors: 1,  status: 'DRAFT',       readiness: 'PENDING' },
  { id: '4', branch: 'Pacific Park Sriracha', region: 'UPC',   sensors: 5,  status: 'CONFIRMED',   readiness: 'READY' },
  { id: '5', branch: 'Big C Nakhonratchasima', region: 'UPC',  sensors: 3,  status: 'CANCELLED',   readiness: 'PENDING' },
];

const STATUS_TONE = {
  COMPLETED: 'success',
  IN_PROGRESS: 'warning',
  DRAFT: 'neutral',
  CONFIRMED: 'info',
  CANCELLED: 'danger',
} as const;

const COLUMNS: Column<DemoRow>[] = [
  { key: 'branch', header: 'Branch', width: 240 },
  { key: 'region', header: 'Region', render: (r) => <Pill tone="info" size="sm">{r.region}</Pill> },
  { key: 'sensors', header: 'Sensors', align: 'right', width: 100 },
  {
    key: 'status',
    header: 'Status',
    render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status.replace('_', ' ')}</Pill>,
  },
  {
    key: 'readiness',
    header: 'Readiness',
    render: (r) => (
      <Pill tone={r.readiness === 'READY' ? 'success' : 'neutral'}>{r.readiness}</Pill>
    ),
  },
];

function Section({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide">{name}</h2>
      {children}
    </section>
  );
}

export default function UiKitPage() {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [clicked, setClicked] = useState<string | null>(null);

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="UI kit · 6 components"
        subtitle="dev-only gallery — Card, KpiCard, Pill, PageHeader, FilterBar, DataTable"
        actions={
          <>
            <button className="h-9 px-3.5 rounded-lg border border-surface-border bg-surface-card text-sm font-medium">
              Secondary
            </button>
            <button className="h-9 px-3.5 rounded-lg bg-ditech-navy text-white text-sm font-medium">
              + Primary action
            </button>
          </>
        }
      />

      <Section name="KpiCard">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="แผนทั้งหมด" value={173} hint="ตามช่วงที่เลือก" />
          <KpiCard label="Completed" value={96} delta={{ value: 4, suffix: 'สัปดาห์นี้' }} />
          <KpiCard label="Readiness pending" value={9} delta={{ value: -3, suffix: 'จากสัปดาห์ก่อน' }} />
          <KpiCard label="Delta = 0 (ซ่อน)" value="2" delta={{ value: 0 }} hint="hint แสดงแทน" />
          <KpiCard label="tone=negative" value="12.4%" tone="negative" hint="ต่ำกว่าเป้า" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="tone=positive" value="98.2%" tone="positive" />
          <KpiCard label="ค่าเป็น string" value="1,284 คน" />
          <KpiCard label="ไม่มี delta / hint" value={0} />
        </div>
      </Section>

      <Section name="Pill">
        <Card>
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone="success">COMPLETED</Pill>
            <Pill tone="warning">IN PROGRESS</Pill>
            <Pill tone="neutral">DRAFT</Pill>
            <Pill tone="info">CONFIRMED</Pill>
            <Pill tone="danger">CANCELLED</Pill>
            <Pill tone="success">READY</Pill>
            <Pill tone="neutral">PENDING</Pill>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <Pill tone="info" size="sm">BANGKOK</Pill>
            <Pill tone="info" size="sm">UPC</Pill>
            <Pill tone="neutral" size="sm">size=sm</Pill>
            <Pill tone="warning" size="md">size=md</Pill>
          </div>
        </Card>
      </Section>

      <Section name="Card">
        <div className="grid md:grid-cols-3 gap-3">
          <Card title="มี title อย่างเดียว">
            <p className="text-sm text-ink-secondary">เนื้อหาการ์ด</p>
          </Card>
          <Card title="title + subtitle" subtitle="คำอธิบายรองใต้หัวข้อ">
            <p className="text-sm text-ink-secondary">เนื้อหาการ์ด</p>
          </Card>
          <Card
            title="มี action"
            subtitle="ปุ่มอยู่ขวาของ header row"
            action={<button className="text-sm text-ditech-navy font-medium hover:underline">ดูทั้งหมด</button>}
          >
            <p className="text-sm text-ink-secondary">เนื้อหาการ์ด</p>
          </Card>
          <Card className="md:col-span-3">
            <p className="text-sm text-ink-secondary">ไม่มี header เลย — การ์ดเปล่าสำหรับใส่ chart หรือ table</p>
          </Card>
        </div>
      </Section>

      <Section name="FilterBar + .ui-input">
        <FilterBar onReset={() => { setSearch(''); setRegion(''); }}>
          <input
            className="ui-input w-52"
            placeholder="ค้นหาสาขา…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="ui-input" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">ทุกภูมิภาค</option>
            <option value="BANGKOK">BANGKOK</option>
            <option value="UPC">UPC</option>
          </select>
          <select className="ui-input">
            <option>ทุกสถานะ</option>
          </select>
          <input className="ui-input" type="date" />
          <input className="ui-input w-40" placeholder="disabled" disabled />
        </FilterBar>
        <p className="text-xs text-ink-muted">
          ค่าปัจจุบัน — search: <code>{search || '—'}</code> · region: <code>{region || '—'}</code>
        </p>
      </Section>

      <Section name="DataTable · density=compact (default) · คลิกแถวได้ · header sticky ที่ maxHeight 190px">
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.id}
          maxHeight={190}
          onRowClick={(r) => setClicked(r.branch)}
        />
        <p className="text-xs text-ink-muted">แถวที่คลิกล่าสุด: <code>{clicked ?? '—'}</code></p>
      </Section>

      <Section name="DataTable · density=comfortable">
        <DataTable columns={COLUMNS} rows={ROWS.slice(0, 3)} rowKey={(r) => r.id} density="comfortable" />
      </Section>

      <Section name="DataTable · empty">
        <DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} emptyText="ยังไม่มีแผนติดตั้งในช่วงนี้" />
      </Section>
    </div>
  );
}
