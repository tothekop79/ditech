import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, type Event, type EventStatus, STATUS_LABEL } from '../api/events';
import { EventStatusBadge } from '../components/events/EventStatusBadge';
import { useToast } from '../components/Toast';

const STATUSES: EventStatus[] = ['PLANNING', 'IN_PROGRESS', 'DATA_COLLECTED', 'REPORT_READY', 'COMPLETED', 'CANCELLED'];

export function EventsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const [filters, setFilters] = useState<{ status?: EventStatus; q: string }>({ q: '' });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', filters],
    queryFn: () => eventsApi.list({ status: filters.status, q: filters.q || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => eventsApi.delete(id),
    onSuccess: () => {
      showToast('Event deleted');
      qc.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to delete'),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">📊 Event Reports</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            จัดการ Event และสร้างรายงาน Dashboard อัตโนมัติจากข้อมูล AI People Counting
          </p>
        </div>
        <button onClick={() => navigate('/events/new')}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1.5">
          + New Event
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="🔍 Search by name, organizer, venue..."
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          className="flex-1 min-w-[220px] px-2 py-1.5 text-sm border border-gray-300 rounded"
        />

        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setFilters({ ...filters, status: undefined })}
            className={`text-xs px-2 py-1 rounded border ${
              !filters.status ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilters({ ...filters, status: filters.status === s ? undefined : s })}
              className={`text-xs px-2 py-1 rounded border ${
                filters.status === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-500 ml-auto">{events.length} events</span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : events.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <div className="text-4xl mb-2">📊</div>
          <h3 className="font-semibold text-gray-900 mb-1">No events yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            สร้าง Event แรกเพื่อเริ่มต้นใช้งาน — ระบบจะช่วยจัดการตั้งแต่วางแผนไปจนถึงรายงานส่งมอบ
          </p>
          <button
            onClick={() => navigate('/events/new')}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            + Create your first event
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev}
              onDelete={() => {
                if (confirm(`Delete event "${ev.name}"?\n\nThis will also delete all reports and unlink any plans.`)) {
                  deleteMutation.mutate(ev.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Event card ───
function EventCard({ event, onDelete }: { event: Event; onDelete: () => void }) {
  const days = (event as any)._count?.days || event.days?.length || 0;
  const plans = (event as any)._count?.plans || event.plans?.length || 0;
  const reports = (event as any)._count?.reports || event.reports?.length || 0;
  const latestReport = event.reports?.[0];

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors group">
      <div className="flex items-start justify-between mb-2">
        <Link to={`/events/${event.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <EventStatusBadge status={event.status} />
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              {event.profile}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 truncate hover:text-blue-700">{event.name}</h3>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {event.organizer && <span>👤 {event.organizer}</span>}
            {event.venue && <span> · 📍 {event.venue}</span>}
          </p>
        </Link>
      </div>

      <div className="text-xs text-gray-600 space-y-1 mt-2">
        <div className="flex items-center gap-2">
          <span>📅 {fmtDate(event.startDate)} → {fmtDate(event.endDate)}</span>
        </div>
        {event.customer && (
          <div className="flex items-center gap-2">
            <span>🏢 {event.customer.customerName}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <div className="flex gap-3 text-xs text-gray-500">
          <span>🗓️ {days}d</span>
          <span>🔧 {plans} plans</span>
          <span>📄 {reports} reports</span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link to={`/events/${event.id}`}
            className="text-[11px] px-1.5 py-0.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50">
            Open
          </Link>
          <button onClick={onDelete}
            className="text-[11px] px-1.5 py-0.5 rounded border border-red-300 text-red-600 hover:bg-red-50">
            Delete
          </button>
        </div>
      </div>

      {latestReport && (
        <div className="mt-2 text-[10px] text-gray-400">
          Latest report: <span className="font-mono">{latestReport.status}</span>
          {latestReport.completedAt && <> · {new Date(latestReport.completedAt).toLocaleString()}</>}
        </div>
      )}
    </div>
  );
}
