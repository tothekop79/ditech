import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  monitorApi,
  HOURS_STATE_COLOR,
  HOURS_STATE_LABEL,
  SOURCE_COLOR,
  UNASSIGNED,
  deviceStatusMeta,
  downloadCsv,
  fmtDateTime,
  type FleetDevice,
  type FleetDeviceParams,
} from '../../api/monitor';

export interface DevicePanelSpec {
  /** stable id — also part of the query key */
  key: string;
  title: string;
  params: FleetDeviceParams;
  /** applied after fetching, for cuts the API can't express (e.g. "offline while closed") */
  filter?: (d: FleetDevice) => boolean;
}

/** Right-hand slide-over listing fleet devices behind a KPI tile. Esc or backdrop closes it. */
export function FleetDevicePanel({ spec, onClose }: { spec: DevicePanelSpec; onClose: () => void }) {
  const [q, setQ] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['monitor-devices', spec.key],
    queryFn: () => monitorApi.devices(spec.params),
  });

  const rows = useMemo(() => {
    const base = spec.filter ? devices.filter(spec.filter) : devices;
    const needle = q.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((d) =>
      (d.name ?? '').toLowerCase().includes(needle) ||
      (d.localIp ?? '').toLowerCase().includes(needle) ||
      d.serialnum.toLowerCase().includes(needle) ||
      d.site.plazaName.toLowerCase().includes(needle) ||
      (d.site.customer?.customerName ?? UNASSIGNED).toLowerCase().includes(needle),
    );
  }, [devices, spec, q]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-[560px] max-w-full h-full shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{spec.title}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">กด Esc หรือคลิกนอกกรอบเพื่อปิด</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-100">
          <input
            autoFocus
            type="text"
            placeholder="🔍 Search device / site / customer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No devices — ไม่มีอุปกรณ์ในกลุ่มนี้</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="px-3 py-1.5 font-medium">Site · Device</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium text-right">Offline</th>
                  <th className="px-2 py-1.5 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const meta = deviceStatusMeta(d.currentStatus);
                  const alert = d.openAlerts[0];
                  return (
                    <tr key={d.id} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="px-3 py-1.5">
                        <div className="text-[11px] text-gray-400">{d.site.customer?.customerName ?? UNASSIGNED}</div>
                        <div>
                          <span className={`text-[10px] uppercase tracking-wider px-1 py-0.5 rounded border mr-1 ${SOURCE_COLOR[d.site.source]}`}>
                            {d.site.source}
                          </span>
                          <Link to={`/monitor/sites/${d.site.id}`} onClick={onClose} className="text-blue-600 hover:underline">
                            {d.site.plazaName}
                          </Link>
                        </div>
                        <div className="text-gray-900">{d.name || d.serialnum}</div>
                        <div className="text-[11px] text-gray-400 font-mono">{d.localIp || '—'}</div>
                        {alert && (
                          <div className="text-[10px] text-red-600 mt-0.5" title={fmtDateTime(alert.openedAt)}>
                            🚨 {alert.type} · {alert.state}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-mono text-gray-600" title={fmtDateTime(d.statusSince)}>
                        {d.offlineHours === null ? '—' : `${d.offlineHours} h`}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${HOURS_STATE_COLOR[d.hoursState]}`}
                          title={HOURS_STATE_LABEL[d.hoursState]}>
                          {d.hoursState}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500">{rows.length} devices</span>
          <button
            onClick={() => exportDevicesCsv(spec, rows)}
            disabled={rows.length === 0}
            className="px-2.5 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50">
            ⬇️ Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}

const CSV_HEADERS = [
  'customer', 'site', 'source', 'device', 'serialnum', 'localIp',
  'status', 'offlineHours', 'hoursState', 'statusSince', 'openAlert',
];

function exportDevicesCsv(spec: DevicePanelSpec, rows: FleetDevice[]) {
  downloadCsv(
    `camera-devices-${spec.key}-${new Date().toISOString().slice(0, 10)}.csv`,
    CSV_HEADERS,
    rows.map((d) => [
      d.site.customer?.customerName ?? UNASSIGNED,
      d.site.plazaName,
      d.site.source,
      d.name ?? '',
      d.serialnum,
      d.localIp ?? '',
      deviceStatusMeta(d.currentStatus).label,
      d.offlineHours === null ? '' : String(d.offlineHours),
      d.hoursState,
      d.statusSince ?? '',
      d.openAlerts[0]?.type ?? '',
    ]),
  );
}
