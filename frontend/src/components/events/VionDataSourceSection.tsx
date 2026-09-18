/**
 * Event Report v2 — the 📡 แหล่งข้อมูล section of the event config.
 *
 * Renders nothing at all when the backend reports the feature off (404), so an
 * UPLOAD-only deployment looks exactly as it did before v2 existed.
 */
import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsApi, type Event } from '../../api/events';
import {
  vionApi, isFeatureOff, VION_SERVERS,
  type VionServer, type EventDataSource, type VionProbeResult, type EventFetchRun,
} from '../../api/vion';
import { useToast } from '../Toast';

const ymd = (d: string | Date) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** Inclusive YYYY-MM-DD range. */
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function VionDataSourceSection({ event }: { event: Event }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const [editing, setEditing] = useState(false);
  const [dataSource, setDataSource] = useState<EventDataSource>(event.dataSource ?? 'UPLOAD');
  const [server, setServer] = useState<VionServer>(event.vionServer ?? 'RETAIL');
  const [plazaId, setPlazaId] = useState(event.vionPlazaId ?? '');
  const [probe, setProbe] = useState<VionProbeResult | null>(null);
  const [pickedDates, setPickedDates] = useState<string[]>([]);
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (editing) return;
    setDataSource(event.dataSource ?? 'UPLOAD');
    setServer(event.vionServer ?? 'RETAIL');
    setPlazaId(event.vionPlazaId ?? '');
  }, [event, editing]);

  // Doubles as the feature probe: 404 → the whole section hides.
  const history = useQuery({
    queryKey: ['event-vion-fetches', event.id],
    queryFn: () => vionApi.fetches(event.id),
    retry: false,
    refetchInterval: (q) => {
      const runs = q.state.data?.runs ?? [];
      return runs.some((r: EventFetchRun) => r.status === 'QUEUED' || r.status === 'RUNNING') ? 3000 : false;
    },
  });

  const save = useMutation({
    mutationFn: () => eventsApi.update(event.id, {
      dataSource,
      vionServer: dataSource === 'VION' ? server : null,
      vionPlazaId: dataSource === 'VION' ? plazaId.trim() : null,
    }),
    onSuccess: () => {
      showToast('บันทึกแหล่งข้อมูลแล้ว');
      qc.invalidateQueries({ queryKey: ['event', event.id] });
      setEditing(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'บันทึกไม่สำเร็จ'),
  });

  const runProbe = useMutation({
    mutationFn: () => vionApi.probe(event.id),
    onSuccess: (d) => { setProbe(d); showToast(`เชื่อมต่อได้: ${d.plazaName}`); },
    onError: (e: any) => { setProbe(null); showToast(e?.response?.data?.message || 'เชื่อมต่อไม่สำเร็จ'); },
  });

  const runFetch = useMutation({
    mutationFn: () => vionApi.fetch(event.id, {
      dates: pickedDates.length ? pickedDates : undefined,
      force,
    }),
    onSuccess: (runs) => {
      showToast(`สั่งดึงข้อมูล ${runs.length} วันแล้ว`);
      qc.invalidateQueries({ queryKey: ['event-vion-fetches', event.id] });
      qc.invalidateQueries({ queryKey: ['event-rawdata-files', event.id] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'สั่งดึงข้อมูลไม่สำเร็จ'),
  });

  const retentionFloor = history.data?.retentionFloor ?? probe?.retentionFloor ?? null;

  // Every day of the event, flagged against the retention window and against what we already have.
  const eventDays = useMemo(() => {
    const from = ymd(event.startDate);
    const to = ymd(event.endDate);
    if (from > to) return [];
    return eachDay(from, to);
  }, [event.startDate, event.endDate]);

  const fetchedDates = new Set(history.data?.apiDates ?? []);

  // Entrance/passer-by gates configured on the event vs the names the vendor actually has.
  const configuredGateNames = (event.gates ?? []).map((g) => g.name);
  const vendorNames = probe ? [...probe.gates, ...probe.zones] : [];
  const unmatchedGates = probe
    ? configuredGateNames.filter((n) => !vendorNames.includes(n))
    : [];

  if (history.isError && isFeatureOff(history.error)) return null;   // feature off → section does not exist

  const dirty =
    dataSource !== (event.dataSource ?? 'UPLOAD') ||
    (dataSource === 'VION' && (server !== (event.vionServer ?? 'RETAIL') || plazaId.trim() !== (event.vionPlazaId ?? '')));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 md:col-span-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">📡 แหล่งข้อมูล</h4>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-blue-600">✏️ Edit</button>
        ) : (
          <div className="flex gap-1.5">
            <button onClick={() => setEditing(false)} className="text-xs px-2 py-0.5 text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || !dirty || (dataSource === 'VION' && !plazaId.trim())}
              className="text-xs px-2.5 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* ── mode ── */}
      <div className="flex flex-wrap gap-4 text-xs mb-3">
        {([
          ['UPLOAD', 'อัปโหลดไฟล์ (เดิม)'],
          ['VION', 'ดึงจาก Vion อัตโนมัติ'],
        ] as [EventDataSource, string][]).map(([value, label]) => (
          <label key={value} className={`flex items-center gap-1.5 ${editing ? 'cursor-pointer' : 'cursor-default'}`}>
            <input
              type="radio"
              name={`dataSource-${event.id}`}
              checked={dataSource === value}
              disabled={!editing}
              onChange={() => setDataSource(value)}
            />
            <span className={dataSource === value ? 'font-medium text-gray-800' : 'text-gray-500'}>{label}</span>
          </label>
        ))}
      </div>

      {dataSource === 'UPLOAD' && (
        <p className="text-[11px] text-gray-400 italic">
          อัปโหลดไฟล์ CaptureRecordsDetails เองเหมือนเดิม — ระบบไม่ดึงข้อมูลอัตโนมัติ
        </p>
      )}

      {dataSource === 'VION' && (
        <div className="space-y-3">
          {/* ── server + plaza ── */}
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-gray-500">Server</span>
              <select
                value={server}
                disabled={!editing}
                onChange={(e) => setServer(e.target.value as VionServer)}
                className="px-2 py-1 border border-gray-200 rounded disabled:bg-gray-50 disabled:text-gray-500"
              >
                {VION_SERVERS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label} · {s.host}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-[280px]">
              <span className="text-gray-500">Plaza ID</span>
              <input
                value={plazaId}
                disabled={!editing}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                onChange={(e) => setPlazaId(e.target.value)}
                className="px-2 py-1 border border-gray-200 rounded font-mono disabled:bg-gray-50 disabled:text-gray-500"
              />
            </label>
            <button
              onClick={() => runProbe.mutate()}
              disabled={runProbe.isPending || !event.vionPlazaId}
              title={!event.vionPlazaId ? 'บันทึก plaza ID ก่อนจึงทดสอบได้' : ''}
              className="px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {runProbe.isPending ? 'กำลังทดสอบ…' : '🔌 ทดสอบการเชื่อมต่อ'}
            </button>
          </div>

          {/* ── probe result ── */}
          {probe && (
            <div className="bg-gray-50 border border-gray-200 rounded p-2 text-[11px] space-y-1.5">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span><span className="text-gray-500">Plaza:</span> <b>{probe.plazaName}</b></span>
                <span><span className="text-gray-500">กล้อง:</span> <b>{probe.deviceCount}</b></span>
                <span><span className="text-gray-500">ข้อมูลเก่าสุดที่มี:</span> <b>{probe.firstSeen ?? '—'}</b></span>
              </div>
              <div>
                <span className="text-gray-500">Gate ({probe.gates.length}):</span>{' '}
                {probe.gates.map((g) => (
                  <span key={g} className="inline-block bg-white border border-gray-200 rounded px-1 mr-1 mb-0.5 font-mono">{g}</span>
                ))}
              </div>
              {probe.zones.length > 0 && (
                <div>
                  <span className="text-gray-500">Zone ({probe.zones.length}):</span>{' '}
                  {probe.zones.map((z) => (
                    <span key={z} className="inline-block bg-white border border-gray-200 rounded px-1 mr-1 mb-0.5 font-mono">{z}</span>
                  ))}
                </div>
              )}
              {unmatchedGates.length > 0 ? (
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                  ⚠️ Gate ใน config ไม่ตรงกับชื่อจริงบน Vion: {unmatchedGates.map((g) => `"${g}"`).join(', ')} —
                  engine จะไม่รู้จัก Entrance เหล่านี้ แก้ชื่อใน 🚪 Gates ให้ตรงก่อน generate
                </p>
              ) : (
                configuredGateNames.length > 0 && (
                  <p className="text-emerald-700">✅ Gate ใน config ตรงกับชื่อบน Vion ครบทุกตัว</p>
                )
              )}
            </div>
          )}

          {retentionFloor && (
            <p className="text-[11px] text-gray-600 bg-blue-50 border border-blue-100 rounded px-2 py-1">
              ℹ️ ข้อมูลใน Vion เหลือถึงวันที่ <b>{retentionFloor}</b> (วันนี้−{(history.data?.retentionDays ?? 7) - 1})
              — วันที่เก่ากว่านี้ดึงย้อนหลังไม่ได้แล้ว
            </p>
          )}

          {/* ── fetch now ── */}
          <div className="border border-gray-200 rounded p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-gray-600">ดึงข้อมูลตอนนี้</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                  เขียนทับไฟล์เดิม
                </label>
                <button
                  onClick={() => runFetch.mutate()}
                  disabled={runFetch.isPending || !event.vionPlazaId}
                  className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {runFetch.isPending ? 'กำลังสั่ง…' : `⬇️ ดึงข้อมูล${pickedDates.length ? ` ${pickedDates.length} วัน` : 'ทุกวันที่ยังดึงได้'}`}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {eventDays.map((d) => {
                const expired = retentionFloor != null && d < retentionFloor;
                const picked = pickedDates.includes(d);
                const have = fetchedDates.has(d);
                return (
                  <button
                    key={d}
                    disabled={expired}
                    onClick={() => setPickedDates((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))}
                    title={expired ? 'เกิน retention ของ Vion แล้ว' : have ? 'มีไฟล์จาก API แล้ว' : ''}
                    className={
                      'px-1.5 py-0.5 rounded border text-[10px] font-mono ' +
                      (expired
                        ? 'border-gray-200 text-gray-300 line-through cursor-not-allowed'
                        : picked
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : have
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50')
                    }
                  >
                    {d.slice(5)}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              ไม่เลือกวัน = ดึงทุกวันของงานที่ยังอยู่ใน retention · เขียว = มีไฟล์จาก API แล้ว
            </p>
          </div>

          {/* ── history ── */}
          <FetchHistoryTable runs={history.data?.runs ?? []} />
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  QUEUED: 'bg-gray-100 text-gray-600',
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  SKIPPED: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-red-100 text-red-700',
};

function FetchHistoryTable({ runs }: { runs: EventFetchRun[] }) {
  const [openError, setOpenError] = useState<string | null>(null);
  if (runs.length === 0) {
    return <p className="text-[11px] text-gray-400 italic">ยังไม่มีประวัติการดึงข้อมูล</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200">
            <th className="text-left py-1 font-medium">วันที่</th>
            <th className="text-left py-1 font-medium">สถานะ</th>
            <th className="text-right py-1 font-medium">แถว</th>
            <th className="text-right py-1 font-medium">เต็มวัน</th>
            <th className="text-right py-1 font-medium">vendor</th>
            <th className="text-right py-1 font-medium">เวลา</th>
            <th className="text-left py-1 font-medium pl-2">สั่งโดย</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-gray-50">
              <td className="py-1 font-mono">{r.date}</td>
              <td className="py-1">
                <span className={`px-1.5 py-0.5 rounded ${STATUS_STYLE[r.status] ?? 'bg-gray-100'}`}>{r.status}</span>
                {r.errorMessage && (
                  <button
                    onClick={() => setOpenError(openError === r.id ? null : r.id)}
                    className="ml-1 text-red-600 hover:underline"
                  >
                    {openError === r.id ? 'ซ่อน' : 'ดูข้อผิดพลาด'}
                  </button>
                )}
                {openError === r.id && r.errorMessage && (
                  <pre className="mt-1 whitespace-pre-wrap text-[10px] bg-red-50 border border-red-200 rounded p-1 text-red-800">
                    {r.errorMessage}
                  </pre>
                )}
              </td>
              <td className="py-1 text-right font-mono">{r.rows?.toLocaleString() ?? '—'}</td>
              <td className="py-1 text-right font-mono text-gray-400">{r.fullDayRows?.toLocaleString() ?? '—'}</td>
              <td className="py-1 text-right font-mono text-gray-400">{r.reportedTotal?.toLocaleString() ?? '—'}</td>
              <td className="py-1 text-right font-mono text-gray-500">
                {r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
              </td>
              <td className="py-1 pl-2 text-gray-500">{r.triggeredBy}{r.force ? ' · force' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
