import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  monitorApi,
  ALERT_STATE_COLOR,
  SOURCE_COLOR,
  WEEK_LABEL,
  deviceStatusMeta,
  fmtDateTime,
  relativeTime,
  type MonitorAlert,
  type MonitoredDevice,
  type MonitoredSiteDetail,
} from '../api/monitor';
import { useToast } from '../components/Toast';

const WEEKS = [1, 2, 3, 4, 5, 6, 7];

export function MonitorSitePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [showResolved, setShowResolved] = useState(false);

  const { data: site, isLoading } = useQuery({
    queryKey: ['monitor-site', id],
    queryFn: () => monitorApi.site(id!),
    enabled: !!id,
    refetchInterval: 60_000,
  });

  const { data: resolved = [] } = useQuery({
    queryKey: ['monitor-alerts', { siteId: id, state: 'RESOLVED' }],
    queryFn: () => monitorApi.alerts({ siteId: id!, state: 'RESOLVED', limit: 200 }),
    enabled: !!id && showResolved,
  });

  const patch = useMutation({
    mutationFn: (body: { monitored?: boolean; alwaysOpen?: boolean }) => monitorApi.patchSite(id!, body),
    onSuccess: () => {
      showToast('Site updated');
      qc.invalidateQueries({ queryKey: ['monitor-site', id] });
      qc.invalidateQueries({ queryKey: ['monitor-overview'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to update site'),
  });

  const ack = useMutation({
    mutationFn: (alertId: string) => monitorApi.ackAlert(alertId),
    onSuccess: () => {
      showToast('Alert acknowledged');
      qc.invalidateQueries({ queryKey: ['monitor-site', id] });
      qc.invalidateQueries({ queryKey: ['monitor-overview'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to acknowledge'),
  });

  if (isLoading) return <div className="py-20 text-center text-gray-400">Loading…</div>;
  if (!site) return <div className="py-20 text-center text-gray-400">Site not found — ไม่พบสาขานี้</div>;

  const open = site.alerts.filter((a) => a.state === 'OPEN' || a.state === 'ACKNOWLEDGED');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/monitor" className="text-sm text-blue-600 hover:underline">← Back to Camera Monitor</Link>
      </div>

      <SiteHeader site={site} onPatch={(b) => patch.mutate(b)} />

      {/* Devices */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <div className="px-3 py-2 border-b border-gray-200 text-sm font-medium text-gray-700">
          📹 Devices · กล้อง <span className="text-gray-400 font-normal">({site.devices.length})</span>
        </div>
        {site.devices.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No devices — ยังไม่มีกล้องในสาขานี้</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                <th className="px-3 py-2 font-medium">Device</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Since · ตั้งแต่</th>
                <th className="px-2 py-2 font-medium">Vendor modifyTime</th>
                <th className="px-2 py-2 font-medium">Channels · ประตู</th>
                <th className="px-2 py-2 font-medium text-right">Uptime 7d</th>
              </tr>
            </thead>
            <tbody>
              {site.devices.map((dev) => (
                <DeviceRow key={dev.id} device={dev} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Open alerts */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-3 py-2 border-b border-gray-200 text-sm font-medium text-gray-700">
          🚨 Open alerts · แจ้งเตือนค้างอยู่ <span className="text-gray-400 font-normal">({open.length})</span>
        </div>
        {open.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">All clear — ไม่มีแจ้งเตือนค้าง</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {open.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                onAck={a.state === 'OPEN' ? () => ack.mutate(a.id) : undefined}
                acking={ack.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Resolved alerts (collapsed) */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <button
          onClick={() => setShowResolved(!showResolved)}
          className="w-full px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
          <span className="text-xs">{showResolved ? '▾' : '▸'}</span>
          ✅ Resolved alerts · แจ้งเตือนที่จบแล้ว
          {showResolved && <span className="text-gray-400 font-normal">({resolved.length})</span>}
        </button>
        {showResolved && (
          resolved.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm border-t border-gray-100">Nothing resolved yet</div>
          ) : (
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {resolved.map((a) => <AlertRow key={a.id} alert={a} />)}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Header ───

function SiteHeader({ site, onPatch }: { site: MonitoredSiteDetail; onPatch: (b: { monitored?: boolean; alwaysOpen?: boolean }) => void }) {
  const hours = site.businessHours ?? [];
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${SOURCE_COLOR[site.source]}`}>
          {site.source}
        </span>
        {site.accountAmbiguous && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
            ⚠️ ambiguous group
          </span>
        )}
      </div>

      <h2 className="text-xl font-bold text-gray-900">{site.plazaName}</h2>
      <p className="text-sm text-gray-600 mt-1">
        🏢 {site.customer?.customerName ?? '(unassigned)'}
        {site.customerSource && <span className="text-xs text-gray-400"> · {site.customerSource}</span>}
        {site.vendorGroupName && <span> · 🏷️ {site.vendorGroupName}</span>}
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm text-gray-700">
        <span>🕓 tz {site.timeZone}</span>
        <span>🔄 synced {relativeTime(site.lastSyncedAt)}</span>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={site.alwaysOpen} onChange={(e) => onPatch({ alwaysOpen: e.target.checked })} />
          🕛 Always open 24h · เปิดตลอด
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={site.monitored} onChange={(e) => onPatch({ monitored: e.target.checked })} />
          👁️ Monitored · มอนิเตอร์อยู่
        </label>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-500 mb-1">Business hours · เวลาทำการ {site.alwaysOpen && <span className="text-gray-400">(ignored — 24h site)</span>}</div>
        <div className="flex flex-wrap gap-1">
          {WEEKS.map((w) => {
            const h = hours.find((x) => x.week === w);
            const unknown = !h || (h.startTime === '00:00' && h.endTime === '00:00');
            return (
              <span
                key={w}
                className={`text-[11px] px-1.5 py-0.5 rounded border ${
                  unknown ? 'bg-gray-50 text-gray-400 border-gray-200' : 'bg-white text-gray-700 border-gray-300'
                }`}>
                {WEEK_LABEL[w]} {h && !unknown ? `${h.startTime}–${h.endTime}` : '—'}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Device row ───

function DeviceRow({ device }: { device: MonitoredDevice }) {
  const meta = deviceStatusMeta(device.currentStatus);
  const gates = (device.channels ?? []).map((c) => c.site?.gateName).filter((g): g is string => !!g);

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3 py-1.5">
        <div className="text-gray-900">{device.name || device.serialnum}</div>
        <div className="text-[11px] text-gray-400 font-mono">
          {device.localIp || '—'} · {device.serialnum}
          {device.mac && <> · {device.mac}</>}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.color}`}>{meta.label}</span>
      </td>
      <td className="px-2 py-1.5 text-xs text-gray-500" title={fmtDateTime(device.statusSince)}>
        {relativeTime(device.statusSince)}
      </td>
      <td className="px-2 py-1.5 text-xs text-gray-500">{fmtDateTime(device.vendorModifyTime)}</td>
      <td className="px-2 py-1.5 text-xs text-gray-500">
        {gates.length ? gates.join(', ') : <span className="text-gray-300">{device.channelCount} ch</span>}
      </td>
      <td className="px-2 py-1.5 text-right">
        <UptimeCell deviceId={device.id} />
      </td>
    </tr>
  );
}

/** Fetches uptime only once the row is scrolled into view — 1 request per device, on demand. */
function UptimeCell({ deviceId }: { deviceId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true); },
      { rootMargin: '150px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const { data, isLoading } = useQuery({
    queryKey: ['monitor-uptime', deviceId, 7],
    queryFn: () => monitorApi.uptime(deviceId, 7),
    enabled: visible,
    staleTime: 5 * 60_000,
  });

  const pct = data?.uptimePct;
  const tone = pct === undefined ? 'text-gray-300' : pct >= 99 ? 'text-green-700' : pct >= 95 ? 'text-amber-600' : 'text-red-600';

  return (
    <span ref={ref} className={`text-xs font-mono ${tone}`} title={data ? `${data.transitions} status changes / ${data.days}d` : undefined}>
      {isLoading || !visible ? '…' : pct === undefined ? '—' : `${pct}%`}
    </span>
  );
}

// ─── Alert row ───

function AlertRow({ alert, onAck, acking }: { alert: MonitorAlert; onAck?: () => void; acking?: boolean }) {
  return (
    <div className="px-3 py-2 flex items-start gap-3">
      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${ALERT_STATE_COLOR[alert.state]}`}>
        {alert.state}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900">{alert.message}</div>
        <div className="text-[11px] text-gray-400">
          {alert.type} · {alert.severity} · opened {fmtDateTime(alert.openedAt)} ({relativeTime(alert.openedAt)})
          {alert.resolvedAt && <> · resolved {fmtDateTime(alert.resolvedAt)}</>}
        </div>
      </div>
      {onAck && (
        <button
          onClick={onAck}
          disabled={acking}
          className="text-[11px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 shrink-0">
          Ack
        </button>
      )}
    </div>
  );
}
