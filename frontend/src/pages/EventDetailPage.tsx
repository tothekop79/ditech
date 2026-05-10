import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, type EventStatus, STATUS_LABEL, PROFILE_DESC } from '../api/events';
import { EventStatusBadge } from '../components/events/EventStatusBadge';
import { RawdataUploader } from '../components/events/RawdataUploader';
import { RawdataFilesPanel } from '../components/events/RawdataFilesPanel';
import { EditEventModal } from '../components/events/EditEventModal';
import { ReportsList } from '../components/events/ReportsList';
import { EventConfigEditor } from '../components/events/EventConfigEditor';
import { useToast } from '../components/Toast';

const STATUSES: EventStatus[] = ['PLANNING', 'IN_PROGRESS', 'DATA_COLLECTED', 'REPORT_READY', 'COMPLETED', 'CANCELLED'];

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const [tab, setTab] = useState<'overview' | 'config' | 'plans' | 'reports'>('overview');
  const [editModalOpen, setEditModalOpen] = useState(false);

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => eventsApi.get(id!),
    enabled: !!id,
  });

  const { data: rawdataStatus } = useQuery({
    queryKey: ['event-rawdata-status', id],
    queryFn: () => eventsApi.rawdataStatus(id!),
    enabled: !!id,
  });

  const setStatus = useMutation({
    mutationFn: (status: EventStatus) => eventsApi.setStatus(id!, status),
    onSuccess: () => {
      showToast('Status updated');
      qc.invalidateQueries({ queryKey: ['event', id] });
    },
  });

  if (isLoading) return <div className="py-20 text-center text-gray-400">Loading…</div>;
  if (!event) return <div className="py-20 text-center text-gray-400">Event not found</div>;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const dayCount = event.days?.length || 0;
  const planCount = event.plans?.length || 0;
  const reportCount = event.reports?.length || 0;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link to="/events" className="text-sm text-blue-600 hover:underline">← Back to events</Link>
      </div>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <EventStatusBadge status={event.status} />
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
            {event.profile}
          </span>
          {event.confidential && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-50 text-red-600">
              🔒 Confidential
            </span>
          )}
        </div>

        <div className="flex items-center flex-wrap"><h2 className="text-xl font-bold text-gray-900">{event.name}</h2>
        <button type="button" onClick={() => setEditModalOpen(true)}
          className="ml-3 text-xs px-2.5 py-1 border border-gray-300 text-gray-700 rounded hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 inline-flex items-center gap-1 align-middle cursor-pointer"
          title="Edit event details">
          ✏️ <span>Edit</span>
        </button></div>
        <p className="text-sm text-gray-600 mt-1">
          {event.organizer && <span>👤 {event.organizer}</span>}
          {event.venue && <span> · 📍 {event.venue}</span>}
        </p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm text-gray-700">
          <span>📅 {fmtDate(event.startDate)} → {fmtDate(event.endDate)}</span>
          <span>🗓️ {dayCount} day{dayCount !== 1 ? 's' : ''}</span>
          <span>🚪 {event.gates?.length || 0} gates</span>
          {event.profile !== 'SIMPLE' && <span>📍 {event.zones?.length || 0} zones</span>}
          {event.profile === 'FULL' && <span>🎯 {event.activities?.length || 0} activities</span>}
        </div>

        {/* Status changer */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">Change status:</span>
          <select value={event.status}
            onChange={(e) => setStatus.mutate(e.target.value as EventStatus)}
            className="text-xs px-2 py-1 border border-gray-300 rounded bg-white">
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>📋 Overview</TabBtn>
        <TabBtn active={tab === 'config'} onClick={() => setTab('config')}>⚙️ Config</TabBtn>
        <TabBtn active={tab === 'plans'} onClick={() => setTab('plans')}>🔧 Plans ({planCount})</TabBtn>
        <TabBtn active={tab === 'reports'} onClick={() => setTab('reports')}>📊 Reports ({reportCount})</TabBtn>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <OverviewTab event={event} hasRawdata={rawdataStatus?.uploaded || false} />
      )}
      {tab === 'config' && <ConfigTab event={event} />}
      {tab === 'plans' && <PlansTab event={event} />}
      {tab === 'reports' && (
        <ReportsList eventId={event.id} hasRawdata={rawdataStatus?.uploaded || false} event={event} />
      )}
      <EditEventModal event={event} open={editModalOpen} onClose={() => setEditModalOpen(false)} />
    </div>
  );
}

const TabBtn = ({ active, onClick, children }: any) => (
  <button onClick={onClick}
    className={`px-3 py-1.5 text-sm transition-colors -mb-[1px] border-b-2 ${
      active ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`}>
    {children}
  </button>
);

// ─── Overview Tab ─────────────────────────────────────────────
function OverviewTab({ event, hasRawdata }: { event: any; hasRawdata: boolean }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3">Event details</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field label="Profile">{event.profile} — <span className="text-xs text-gray-500">{PROFILE_DESC[event.profile]}</span></Field>
            <Field label="Venue type">{event.venueType}</Field>
            <Field label="Working hours">
              {String(event.displayHoursStart).padStart(2, '0')}:00 – {String(event.displayHoursEnd).padStart(2, '0')}:00
            </Field>
            <Field label="Engagement threshold">{event.engagementThresholdSec}s</Field>
            <Field label="Show passerby">{event.showPasserby ? 'Yes' : 'No'}</Field>
            <Field label="Customer">{event.customer?.customerName || '—'}</Field>
          </div>
          {event.description && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Field label="Description">
                <p className="text-sm whitespace-pre-wrap">{event.description}</p>
              </Field>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <RawdataFilesPanel
            eventId={event.id}
            configuredDates={(event.days || []).map((d: any) => (typeof d.date === 'string' ? d.date.slice(0, 10) : new Date(d.date).toISOString().slice(0, 10)))}
          />
          {hasRawdata && (
            <p className="text-[11px] text-gray-500 mt-2">
              ✅ Ready to generate reports — go to the Reports tab.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Config Tab ──────────────────────────────────────────────
function ConfigTab({ event }: { event: any }) {
  return <EventConfigEditor event={event} />;
}

const Section = ({ title, children }: any) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3">
    <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">{title}</h4>
    {children}
  </div>
);

const Empty = () => <div className="text-xs text-gray-400 italic py-2">— None —</div>;

const Field = ({ label, children }: any) => (
  <div>
    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">{label}</div>
    <div className="text-sm text-gray-900">{children}</div>
  </div>
);

// ─── Plans Tab ────────────────────────────────────────────────
function PlansTab({ event }: { event: any }) {
  const plans = event.plans || [];

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-sm">🔧 Linked installation plans</h3>
        <span className="text-xs text-gray-400">{plans.length} plan{plans.length !== 1 ? 's' : ''}</span>
      </div>

      {plans.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">
          <div className="text-3xl mb-2">🔗</div>
          <p>No plans linked yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Plan-linking UI will be added in M1-D. For now use the API:<br />
            <code className="text-[11px]">POST /api/events/{event.id}/plans/&lt;planId&gt;</code>
          </p>
        </div>
      ) : (
        <ul>
          {plans.map((p: any) => (
            <li key={p.id} className="px-4 py-2 border-b border-gray-100 last:border-0 flex items-center gap-3">
              <span className="flex-1">
                <Link to={`/plans/${p.id}`} className="text-sm font-medium hover:text-blue-700">
                  {p.storeName} {p.branchName && <span className="text-gray-500">— {p.branchName}</span>}
                </Link>
              </span>
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{p.planStatus}</span>
              {p.scheduledDate && (
                <span className="text-xs text-gray-500">{new Date(p.scheduledDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
              )}
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
