import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  monitorApi,
  ALERT_STATE_COLOR,
  ALERT_TYPES,
  SOURCE_COLOR,
  UNASSIGNED,
  downloadCsv,
  fmtDateTime,
  relativeTime,
  type AlertState,
  type AlertType,
  type MonitorAlertRow,
} from '../api/monitor';
import { useToast } from '../components/Toast';

/** 'ACTIVE' = no state param → backend returns OPEN + ACKNOWLEDGED. */
type StateFilter = 'ACTIVE' | AlertState;
const STATE_FILTERS: StateFilter[] = ['ACTIVE', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
const STATE_FILTER_LABEL: Record<StateFilter, string> = {
  ACTIVE: 'Active · ค้างอยู่',
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
};

export function MonitorAlertsPage() {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const [state, setState] = useState<StateFilter>('ACTIVE');
  const [type, setType] = useState<AlertType | ''>('');
  const [customer, setCustomer] = useState('');

  const params = { state: state === 'ACTIVE' ? undefined : state, type: type || undefined, limit: 500 };

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['monitor-alerts', params],
    queryFn: () => monitorApi.alerts(params),
    refetchInterval: 60_000,
  });

  const ack = useMutation({
    mutationFn: (id: string) => monitorApi.ackAlert(id),
    onSuccess: () => {
      showToast('Alert acknowledged');
      qc.invalidateQueries({ queryKey: ['monitor-alerts'] });
      qc.invalidateQueries({ queryKey: ['monitor-overview'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to acknowledge'),
  });

  // The alerts endpoint has no customer filter — the embedded customerName is filtered client-side.
  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of alerts) names.add(a.site.customer?.customerName ?? UNASSIGNED);
    return [...names].sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)));
  }, [alerts]);

  const rows = useMemo(
    () => (customer ? alerts.filter((a) => (a.site.customer?.customerName ?? UNASSIGNED) === customer) : alerts),
    [alerts, customer],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">🚨 Camera Alerts</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            แจ้งเตือนกล้องดับ — เปิดเมื่อกล้องออฟไลน์เกิน 60 นาทีในเวลาทำการ · ปิดเองเมื่อกล้องกลับมา
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/monitor" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50">
            📷 Fleet overview
          </Link>
          <button
            onClick={() => exportCsv(rows)}
            disabled={rows.length === 0}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            ⬇️ Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1">
          {STATE_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={`text-xs px-2 py-1 rounded border ${
                state === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {STATE_FILTER_LABEL[s]}
            </button>
          ))}
        </div>

        <select
          value={type}
          onChange={(e) => setType(e.target.value as AlertType | '')}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
          <option value="">All types · ทุกประเภท</option>
          {ALERT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
          <option value="">All customers · ทุกลูกค้า</option>
          {customerOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <span className="text-xs text-gray-500 ml-auto">{rows.length} alerts</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400 text-sm">
          No alerts — ไม่มีแจ้งเตือนตามเงื่อนไข
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Customer · ลูกค้า</th>
                <th className="px-2 py-2 font-medium">Site · สาขา</th>
                <th className="px-2 py-2 font-medium">Device</th>
                <th className="px-2 py-2 font-medium">Opened · เปิดเมื่อ</th>
                <th className="px-2 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/40">
                  <td className="px-3 py-1.5">
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${ALERT_STATE_COLOR[a.state]}`}>
                      {a.state}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-600">
                    {a.type}
                    <span className="text-gray-400"> · {a.severity}</span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">{a.site.customer?.customerName ?? UNASSIGNED}</td>
                  <td className="px-2 py-1.5">
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border mr-1.5 ${SOURCE_COLOR[a.site.source]}`}>
                      {a.site.source}
                    </span>
                    <Link to={`/monitor/sites/${a.siteId}`} className="text-blue-600 hover:underline">
                      {a.site.plazaName}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="text-gray-700">{a.device?.name || a.device?.serialnum || '—'}</div>
                    <div className="text-[11px] text-gray-400 font-mono">{a.device?.localIp || ''}</div>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-500" title={a.message}>
                    {fmtDateTime(a.openedAt)}
                    <span className="text-gray-400"> · {relativeTime(a.openedAt)}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {a.state === 'OPEN' && (
                      <button
                        onClick={() => ack.mutate(a.id)}
                        disabled={ack.isPending}
                        className="text-[11px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                        Ack
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── CSV ───

const CSV_HEADERS = [
  'state', 'type', 'severity', 'customer', 'site', 'source',
  'device', 'serialnum', 'localIp', 'message', 'openedAt', 'acknowledgedAt', 'resolvedAt',
];

function exportCsv(rows: MonitorAlertRow[]) {
  downloadCsv(
    `camera-alerts-${new Date().toISOString().slice(0, 10)}.csv`,
    CSV_HEADERS,
    rows.map((a) => [
      a.state, a.type, a.severity,
      a.site.customer?.customerName ?? UNASSIGNED,
      a.site.plazaName, a.site.source,
      a.device?.name ?? '', a.device?.serialnum ?? '', a.device?.localIp ?? '',
      a.message, a.openedAt, a.acknowledgedAt ?? '', a.resolvedAt ?? '',
    ]),
  );
}
