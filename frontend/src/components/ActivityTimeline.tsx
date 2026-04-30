import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commLogsApi } from '../api/communicationLogs';
import { useToast } from './Toast';

const CHANNELS = ['PHONE', 'EMAIL', 'LINE', 'TELEGRAM', 'ON_SITE', 'OTHER'];
const OUTCOMES = ['CONFIRMED', 'PENDING_RESPONSE', 'RESCHEDULED', 'ISSUE', 'NO_ANSWER'];

const CHANNEL_ICONS: Record<string, string> = {
  PHONE: '📞', EMAIL: '✉️', LINE: '💬', TELEGRAM: '📨', ON_SITE: '📍', OTHER: '📝',
};

const FIELD_ICONS: Record<string, string> = {
  readiness: '🚦',
  planStatus: '🏷️',
  scheduledDate: '📅',
  teamId: '👥',
  default: '✏️',
};

const OUTCOME_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-green-50 text-green-700 border-green-200',
  PENDING_RESPONSE: 'bg-amber-50 text-amber-700 border-amber-200',
  RESCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
  ISSUE: 'bg-red-50 text-red-700 border-red-200',
  NO_ANSWER: 'bg-gray-100 text-gray-600 border-gray-200',
};

const fieldLabel = (f: string): string => {
  const map: Record<string, string> = {
    readiness: 'readiness',
    planStatus: 'plan status',
    scheduledDate: 'scheduled date',
    teamId: 'team',
    completedDate: 'completed date',
  };
  return map[f] || f;
};

const formatValue = (field: string, value: any): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'scheduledDate' || field === 'completedDate') {
    try {
      return new Date(value).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch { return String(value); }
  }
  return String(value);
};

const relativeTime = (date: Date): string => {
  const now = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} day ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface Props {
  planId: string;
  statusHistory: any[];
  createdAt?: string;
  createdBy?: { fullName?: string; email?: string } | null;
}

export function ActivityTimeline({ planId, statusHistory, createdAt, createdBy }: Props) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    channel: 'PHONE',
    direction: 'OUTBOUND' as 'INBOUND' | 'OUTBOUND',
    outcome: 'CONFIRMED' as string,
    summary: '',
    contactPerson: '',
  });

  const { data: comms = [] } = useQuery({
    queryKey: ['comm-logs', planId],
    queryFn: () => commLogsApi.list(planId),
    enabled: !!planId,
  });

  const create = useMutation({
    mutationFn: () => commLogsApi.create(planId, {
      channel: form.channel,
      direction: form.direction,
      outcome: form.outcome,
      summary: form.summary,
      contactPerson: form.contactPerson || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comm-logs', planId] });
      showToast('Communication logged');
      setShowForm(false);
      setForm({ channel: 'PHONE', direction: 'OUTBOUND', outcome: 'CONFIRMED', summary: '', contactPerson: '' });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed'),
  });

  // Merge statusHistory + comms + creation event into single timeline
  type Item =
    | { type: 'status'; date: Date; field: string; oldValue: string | null; newValue: string | null; actor: string; note?: string }
    | { type: 'comm'; date: Date; channel: string; outcome: string; notes: string; actor: string; contactPerson?: string }
    | { type: 'created'; date: Date; actor: string };

  const items: Item[] = [];

  // Status history → timeline items
  for (const h of statusHistory || []) {
    items.push({
      type: 'status',
      date: new Date(h.changedAt),
      field: h.fieldChanged,
      oldValue: h.oldValue,
      newValue: h.newValue,
      actor: h.changedBy?.fullName || h.changedBy?.email || 'System',
      note: h.note,
    });
  }

  // Communication logs → timeline items
  for (const c of comms || []) {
    items.push({
      type: 'comm',
      date: new Date(c.createdAt),
      channel: c.channel,
      outcome: c.outcome,
      notes: c.summary || '',
      actor: c.recordedBy?.fullName || c.recordedBy?.email || 'Unknown',
      contactPerson: c.contactPerson,
    });
  }

  // Plan creation event (always last)
  if (createdAt) {
    items.push({
      type: 'created',
      date: new Date(createdAt),
      actor: createdBy?.fullName || createdBy?.email || 'System',
    });
  }

  // Sort DESC (newest first)
  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-medium text-sm">
          <span className="text-gray-400 mr-1.5">💬</span>
          Activity log
          <span className="text-gray-400 ml-1.5">({items.length})</span>
        </h3>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="text-xs text-blue-600 hover:underline">
            + Log a communication
          </button>
        )}
      </div>

      {showForm && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded bg-white">
              {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_ICONS[c]} {c}</option>)}
            </select>
            <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as any })}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded bg-white">
              <option value="OUTBOUND">📤 Outbound (we contacted)</option>
              <option value="INBOUND">📥 Inbound (they contacted)</option>
            </select>
          </div>
          <select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white">
            {OUTCOMES.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
          </select>
          <input value={form.contactPerson}
            onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            placeholder="Contact person (optional)"
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded" />
          <textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="Summary..." rows={5}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded resize-y min-h-[120px]" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-white">Cancel</button>
            <button onClick={() => create.mutate()} disabled={!form.summary || create.isPending}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {create.isPending ? 'Saving…' : 'Save log'}
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        {items.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No activity yet.</p>
        ) : (
          <ul className="space-y-3 relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" aria-hidden />

            {items.map((it, idx) => (
              <li key={idx} className="relative pl-6">
                {/* Dot */}
                <span className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white ring-2 ${
                  it.type === 'comm' ? 'bg-blue-400 ring-blue-200' :
                  it.type === 'created' ? 'bg-gray-400 ring-gray-200' :
                  'bg-amber-400 ring-amber-200'
                }`} />

                <div className="text-xs">
                  {it.type === 'status' && (
                    <>
                      <span className="font-medium text-gray-700">{it.actor}</span>
                      <span className="text-gray-500"> changed </span>
                      <span className="font-medium text-gray-700">{fieldLabel(it.field)}</span>
                      <span className="text-gray-500"> to </span>
                      <span className="font-medium text-gray-700">{formatValue(it.field, it.newValue)}</span>
                      {it.note && <span className="text-gray-500 italic"> — {it.note}</span>}
                    </>
                  )}
                  {it.type === 'comm' && (
                    <>
                      <span className="font-medium text-gray-700">{it.actor}</span>
                      <span className="text-gray-500"> logged </span>
                      <span className="inline-flex items-center gap-1">
                        <span>{CHANNEL_ICONS[it.channel] || '📝'}</span>
                        <span className="text-gray-600">{it.channel.toLowerCase()}</span>
                      </span>
                      {it.contactPerson && (
                        <span className="text-gray-500"> with <span className="text-gray-700">{it.contactPerson}</span></span>
                      )}
                      {it.outcome && (
                        <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] border ${OUTCOME_COLORS[it.outcome] || 'bg-gray-50 border-gray-200'}`}>
                          {it.outcome.replace('_', ' ')}
                        </span>
                      )}
                      {it.notes && (
                        <p className="mt-1 text-gray-600 leading-snug">"{it.notes}"</p>
                      )}
                    </>
                  )}
                  {it.type === 'created' && (
                    <>
                      <span className="font-medium text-gray-700">{it.actor}</span>
                      <span className="text-gray-500"> created this plan</span>
                    </>
                  )}
                  <div className="text-[10px] text-gray-400 mt-0.5">{relativeTime(it.date)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
