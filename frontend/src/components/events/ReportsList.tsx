import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, type EventReport } from '../../api/events';
import { ReportStatusBadge } from './EventStatusBadge';
import { useToast } from '../Toast';
import { api } from '../../api/client';

interface Props {
  eventId: string;
  hasRawdata: boolean;
}

export function ReportsList({ eventId, hasRawdata }: Props) {
  const showToast = useToast((s) => s.show);
  const qc = useQueryClient();

  // Poll every 3s if any RUNNING/QUEUED reports
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

  const downloadXlsx = async () => {
    try {
      const res = await api.get(eventsApi.dashboardXlsxUrl(eventId).replace('/api', ''), { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-${eventId}-dashboard.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to download');
    }
  };

  const openHtml = async () => {
    try {
      const res = await api.get(eventsApi.dashboardHtmlUrl(eventId).replace('/api', ''), { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('Failed to open dashboard');
    }
  };

  const hasCompleted = reports.some((r) => r.status === 'COMPLETED');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">📄 Reports</h3>
        <div className="flex gap-2">
          {hasCompleted && (
            <>
              <button onClick={openHtml}
                className="px-3 py-1.5 text-sm border border-blue-300 text-blue-700 rounded hover:bg-blue-50">
                🌐 Open dashboard
              </button>
              <button onClick={downloadXlsx}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
                ⬇ Download XLSX
              </button>
            </>
          )}
          <button onClick={() => generate.mutate()}
            disabled={!hasRawdata || generate.isPending}
            title={!hasRawdata ? 'Upload Rawdata.xlsx first' : ''}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {generate.isPending ? '…' : '✨ Generate report'}
          </button>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center text-sm text-gray-500">
          {hasRawdata
            ? 'No reports yet — click "Generate report" to create one.'
            : 'Upload Rawdata.xlsx first, then click "Generate report".'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-gray-600">
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Started</th>
                <th className="text-left px-3 py-2 font-medium">Duration</th>
                <th className="text-left px-3 py-2 font-medium">Profile</th>
                <th className="text-left px-3 py-2 font-medium">By</th>
                <th className="text-left px-3 py-2 font-medium">Output</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <ReportStatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {r.startedAt ? new Date(r.startedAt).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short',
                      hour: '2-digit', minute: '2-digit',
                    }) : '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-500">
                    {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-3 py-2 uppercase text-[10px] text-gray-500">{r.profile}</td>
                  <td className="px-3 py-2 text-gray-600">{r.triggeredBy?.fullName || '—'}</td>
                  <td className="px-3 py-2">
                    {r.status === 'COMPLETED' ? (
                      <span className="text-green-700 text-[10px]">
                        HTML: {((r.htmlSize || 0) / 1024).toFixed(0)} KB · XLSX: {((r.xlsxSize || 0) / 1024).toFixed(0)} KB
                      </span>
                    ) : r.status === 'FAILED' ? (
                      <span className="text-red-600 text-[10px] truncate block max-w-[260px]" title={r.errorMessage || ''}>
                        ⚠ {r.errorMessage}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
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
