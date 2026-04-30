import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commLogsApi } from '../api/communicationLogs';
import { useToast } from './Toast';

const CHANNELS = ['PHONE', 'EMAIL', 'LINE', 'TELEGRAM', 'ON_SITE', 'OTHER'];
const OUTCOMES = ['CONFIRMED', 'PENDING_RESPONSE', 'RESCHEDULED', 'ISSUE', 'NO_ANSWER'];

const CHANNEL_ICONS: Record<string, string> = {
  PHONE: '📞', EMAIL: '✉️', LINE: '💬', TELEGRAM: '📨', ON_SITE: '📍', OTHER: '📝',
};

const OUTCOME_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-green-50 text-green-700 border-green-200',
  PENDING_RESPONSE: 'bg-amber-50 text-amber-700 border-amber-200',
  RESCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
  ISSUE: 'bg-red-50 text-red-700 border-red-200',
  NO_ANSWER: 'bg-gray-100 text-gray-600 border-gray-200',
};

// Date label helpers — Odoo-style "Today / Yesterday / 17 Apr 2026" grouping
const dayLabel = (d: Date): string => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  if (dd.getTime() === today.getTime()) return 'Today';
  if (dd.getTime() === yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const timeLabel = (d: Date): string =>
  d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// Generate avatar initials + color from name
const initials = (name?: string) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const avatarColor = (name?: string) => {
  if (!name) return 'bg-gray-400';
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500', 'bg-green-500', 'bg-teal-500', 'bg-indigo-500'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
};

export function CommunicationLogSection({ planId, sticky = false }: { planId: string; sticky?: boolean }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [showForm, setShowForm] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['comm-logs', planId],
    queryFn: () => commLogsApi.list(planId),
  });

  const del = useMutation({
    mutationFn: (id: string) => commLogsApi.delete(id),
    onSuccess: () => {
      showToast('Log deleted');
      qc.invalidateQueries({ queryKey: ['comm-logs', planId] });
    },
  });

  // Group logs by day (newest first)
  const grouped: { label: string; logs: any[] }[] = (() => {
    if (!logs || logs.length === 0) return [];
    const sorted = [...logs].sort((a, b) =>
      new Date(b.contactedAt).getTime() - new Date(a.contactedAt).getTime()
    );
    const map = new Map<string, any[]>();
    for (const l of sorted) {
      const d = new Date(l.contactedAt);
      const key = dayLabel(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return Array.from(map.entries()).map(([label, logs]) => ({ label, logs }));
  })();

  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${sticky ? 'lg:sticky lg:top-4' : ''}`}>
      {/* Header */}
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span>💬</span>
            <span>Activity log</span>
            <span className="text-xs text-gray-400 font-normal">{logs ? `(${logs.length})` : ''}</span>
          </h3>
        </div>
      </div>

      {/* Composer area */}
      <div className="p-3 border-b border-gray-200 bg-white">
        {!showForm ? (
          <button onClick={() => setShowForm(true)}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition">
            + Log a communication...
          </button>
        ) : (
          <NewLogForm planId={planId} onDone={() => setShowForm(false)} />
        )}
      </div>

      {/* Feed */}
      <div className="px-3 py-3 max-h-[calc(100vh-300px)] overflow-y-auto">
        {isLoading ? (
          <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : grouped.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No activity yet.</div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.label}>
                {/* Day separator */}
                <div className="text-xs text-gray-500 font-medium mb-2 sticky top-0 bg-white py-1">
                  {group.label}
                </div>

                <div className="space-y-3">
                  {group.logs.map((l: any) => (
                    <LogEntry key={l.id} log={l} onDelete={() => {
                      if (confirm('Delete this log entry?')) del.mutate(l.id);
                    }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───── LogEntry — single Odoo-style activity entry ─────
function LogEntry({ log, onDelete }: { log: any; onDelete: () => void }) {
  const recordedName = log.recordedBy?.fullName;
  const time = new Date(log.contactedAt);

  return (
    <div className="flex gap-2.5 group">
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full ${avatarColor(recordedName)} text-white text-xs font-semibold flex items-center justify-center`}>
        {initials(recordedName)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Meta line: name · channel · time */}
        <div className="flex items-baseline gap-1.5 flex-wrap mb-0.5">
          <span className="text-xs font-semibold text-gray-900 truncate">{recordedName || 'Unknown'}</span>
          <span className="text-[10px] text-gray-400">·</span>
          <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5">
            <span>{CHANNEL_ICONS[log.channel] || '📝'}</span>
            <span className="font-medium">{log.channel}</span>
          </span>
          <span className="text-[10px] text-gray-400">{log.direction === 'INBOUND' ? '←' : '→'}</span>
          <span className="text-[10px] text-gray-400 ml-auto">{timeLabel(time)}</span>
        </div>

        {/* Outcome chip */}
        {log.outcome && (
          <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border mb-1 ${OUTCOME_COLORS[log.outcome] || 'bg-gray-100 border-gray-200'}`}>
            {log.outcome}
          </span>
        )}

        {/* Contact person */}
        {log.contactPerson && (
          <div className="text-[10px] text-gray-500 mb-1">with {log.contactPerson}</div>
        )}

        {/* Body — message bubble */}
        <div className="text-xs text-gray-800 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded px-2 py-1.5 leading-relaxed">
          {log.summary}
        </div>

        {/* Delete (hover) */}
        <button onClick={onDelete}
          className="mt-1 text-[10px] text-red-500 opacity-0 group-hover:opacity-100 hover:underline transition">
          delete
        </button>
      </div>
    </div>
  );
}

// ───── Compact composer ─────
function NewLogForm({ planId, onDone }: { planId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [form, setForm] = useState({
    channel: 'PHONE',
    direction: 'OUTBOUND',
    contactPerson: '',
    summary: '',
    outcome: '',
    contactedAt: new Date().toISOString().substring(0, 16),
  });

  const create = useMutation({
    mutationFn: () => commLogsApi.create(planId, {
      ...form,
      contactedAt: form.contactedAt ? new Date(form.contactedAt).toISOString() : undefined,
      outcome: form.outcome || undefined,
    }),
    onSuccess: () => {
      showToast('Log added');
      qc.invalidateQueries({ queryKey: ['comm-logs', planId] });
      onDone();
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed'),
  });

  const setField = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-2">
      <textarea value={form.summary} onChange={(e) => setField('summary', e.target.value)}
        placeholder="What was discussed..."
        rows={3}
        autoFocus
        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:border-blue-500 outline-none" />

      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <select value={form.channel} onChange={(e) => setField('channel', e.target.value)}
          className="px-1.5 py-1 border border-gray-300 rounded">
          {CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_ICONS[c]} {c}</option>)}
        </select>
        <select value={form.direction} onChange={(e) => setField('direction', e.target.value)}
          className="px-1.5 py-1 border border-gray-300 rounded">
          <option value="OUTBOUND">→ Outgoing</option>
          <option value="INBOUND">← Incoming</option>
        </select>
        <input type="datetime-local" value={form.contactedAt}
          onChange={(e) => setField('contactedAt', e.target.value)}
          className="px-1.5 py-1 border border-gray-300 rounded" />
        <select value={form.outcome} onChange={(e) => setField('outcome', e.target.value)}
          className="px-1.5 py-1 border border-gray-300 rounded">
          <option value="">Outcome…</option>
          {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <input value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)}
        placeholder="Contact person (optional)"
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onDone}
          className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
        <button onClick={() => create.mutate()}
          disabled={!form.summary.trim() || create.isPending}
          className="px-3 py-1 bg-ditech-primary text-white rounded text-xs hover:bg-blue-800 disabled:opacity-50">
          {create.isPending ? 'Saving...' : 'Log'}
        </button>
      </div>
    </div>
  );
}
