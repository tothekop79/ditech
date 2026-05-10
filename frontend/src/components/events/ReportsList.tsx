import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, Fragment } from 'react';
import { eventsApi, type EventReport } from '../../api/events';
import { ReportStatusBadge } from './EventStatusBadge';
import { useToast } from '../Toast';
import { api } from '../../api/client';
import { VerifyBeforeGenerateModal } from './VerifyBeforeGenerateModal';

interface Props {
  eventId: string;
  hasRawdata: boolean;
  event?: any;
}

export function ReportsList({ eventId, hasRawdata, event }: Props) {
  const showToast = useToast((s) => s.show);
  const qc = useQueryClient();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const { data: reports = [] } = useQuery({
    queryKey: ['event-reports', eventId],
    queryFn: () => eventsApi.reports(eventId),
    refetchInterval: (q) => {
      const data = q.state.data || [];
      return data.some((r: EventReport) => r.status === 'QUEUED' || r.status === 'RUNNING') ? 3000 : false;
    },
  });

  const generate = useMutation({
    mutationFn: () => eventsApi.generate(eventId),
    onSuccess: () => {
      showToast('Report queued — engine will run shortly');
      qc.invalidateQueries({ queryKey: ['event-reports', eventId] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to queue'),
  });

  const openReportDashboard = async (reportId: string) => {
    try {
      const res = await api.get(`/events/reports/${reportId}/dashboard.html`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('Failed to open dashboard');
    }
  };

  const downloadReportXlsx = async (reportId: string) => {
    try {
      const res = await api.get(`/events/reports/${reportId}/dashboard.xlsx`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard-${reportId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('XLSX downloaded');
    } catch {
      showToast('Failed to download');
    }
  };

  const fmtShort = (d: string | undefined) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
  const days = event?.days?.length ?? 0;
  const gates = event?.gates?.length ?? 0;
  const eventDateRange = event ? `${fmtShort(event.startDate)} → ${fmtShort(event.endDate)}` : '';

  // Run number — chronological
  const reportsAsc = [...reports].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const numberById = new Map<string, number>();
  reportsAsc.forEach((r, i) => numberById.set(r.id, i + 1));

  return (
    <div className="space-y-3">
      {/* Section header — event name shown ONCE here */}
      {event && (
        <div className="bg-white border border-gray-200 rounded p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-base text-gray-900">📊 Reports — {event.name}</h3>
              <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {event.organizer && <span>👤 {event.organizer}</span>}
                {event.venue && <span>📍 {event.venue}</span>}
                <span>📅 {eventDateRange}</span>
                <span>🗓 {days} day{days !== 1 ? 's' : ''}</span>
                <span>🚪 {gates} gate{gates !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <button type="button" onClick={() => setVerifyOpen(true)}
              disabled={!hasRawdata || generate.isPending}
              title={!hasRawdata ? 'Upload Rawdata files first' : ''}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
              {generate.isPending ? '…' : '✨ Generate report'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {reports.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center text-sm text-gray-500">
          {hasRawdata
            ? 'No reports yet — click "Generate report" to create one.'
            : 'Upload rawdata files first, then click "Generate report".'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-gray-600">
                <th className="text-left px-3 py-2 font-medium w-[50px]">No.</th>
                <th className="text-left px-3 py-2 font-medium w-[110px]">Status</th>
                <th className="text-left px-3 py-2 font-medium w-[140px]">Started</th>
                <th className="text-left px-3 py-2 font-medium w-[80px]">Duration</th>
                <th className="text-left px-3 py-2 font-medium w-[80px]">Profile</th>
                <th className="text-left px-3 py-2 font-medium">By</th>
                <th className="text-left px-3 py-2 font-medium">Output</th>
                <th className="text-right px-3 py-2 font-medium w-[170px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const completed = r.status === 'COMPLETED';
                const failed = r.status === 'FAILED';
                const inProgress = r.status === 'QUEUED' || r.status === 'RUNNING';
                const isExpanded = expandedError === r.id;
                const num = numberById.get(r.id) ?? '?';
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-500">{num}</td>
                      <td className="px-3 py-2">
                        <ReportStatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {r.startedAt ? new Date(r.startedAt).toLocaleString('en-GB', {
                          day: '2-digit', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                        }) : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-500">
                        {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : (inProgress ? '…' : '—')}
                      </td>
                      <td className="px-3 py-2 uppercase text-[10px] text-gray-500">{r.profile}</td>
                      <td className="px-3 py-2 text-gray-600">{r.triggeredBy?.fullName || '—'}</td>
                      <td className="px-3 py-2">
                        {completed ? (
                          <span className="text-green-700 text-[10px]">
                            HTML {((r.htmlSize || 0) / 1024).toFixed(0)} KB · XLSX {((r.xlsxSize || 0) / 1024).toFixed(0)} KB
                          </span>
                        ) : failed ? (
                          <button type="button" onClick={() => setExpandedError(isExpanded ? null : r.id)}
                            className="text-red-600 text-[10px] hover:underline truncate block max-w-[200px] text-left"
                            title="Click to expand">
                            ⚠ {(r.errorMessage || '').slice(0, 40)}{(r.errorMessage || '').length > 40 ? '…' : ''}
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {completed ? (
                          <div className="flex gap-1 justify-end">
                            <button type="button" onClick={() => openReportDashboard(r.id)}
                              className="text-[11px] px-2 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50">
                              🌐 Open
                            </button>
                            <button type="button" onClick={() => downloadReportXlsx(r.id)}
                              className="text-[11px] px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                              ⬇ XLSX
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && r.errorMessage && (
                      <tr className="border-b border-gray-100">
                        <td colSpan={8} className="px-3 py-2 bg-red-50">
                          <pre className="text-[11px] text-red-900 whitespace-pre-wrap font-mono leading-relaxed">{r.errorMessage}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <VerifyBeforeGenerateModal
        eventId={eventId}
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onConfirmed={() => generate.mutate()}
      />
    </div>
  );
}
