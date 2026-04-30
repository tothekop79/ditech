import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  notificationsApi, type NotificationRule, type NotificationLog,
  type NotificationTrigger, type CreateRuleInput,
} from '../api/notifications';
import { useToast } from '../components/Toast';

// ─────────────────────── Constants ───────────────────────
const TRIGGER_OPTIONS: { value: NotificationTrigger; label: string; emoji: string; needs: string[] }[] = [
  { value: 'DAILY_AT',           label: 'Daily at time',          emoji: '🌅', needs: ['triggerTime'] },
  { value: 'EVENING_DAY_BEFORE', label: 'Day-before evening',     emoji: '🌆', needs: ['triggerTime'] },
  { value: 'WEEKLY_AT',          label: 'Weekly at day & time',   emoji: '📅', needs: ['triggerTime', 'triggerDay'] },
  { value: 'STATUS_CHANGE',      label: 'Status change',          emoji: '🔄', needs: ['triggerCondition'] },
  { value: 'READINESS_READY',    label: 'Readiness → READY',      emoji: '🟢', needs: [] },
  { value: 'NOT_READY_NEAR',     label: 'Not ready N days out',   emoji: '⚠️', needs: ['daysAhead'] },
  { value: 'CAPACITY_OVERFLOW',  label: 'Capacity overflow',      emoji: '🚨', needs: [] },
  { value: 'HANDOVER_GENERATED', label: 'Handover generated',     emoji: '📄', needs: [] },
  { value: 'RESCHEDULED',        label: 'Plan rescheduled',       emoji: '📅', needs: [] },
  { value: 'TEAM_CHANGED',       label: 'Team assigned/changed',  emoji: '👥', needs: [] },
  { value: 'PLAN_CREATED',       label: 'Plan created',           emoji: '🆕', needs: [] },
  { value: 'PHOTO_UPLOADED',     label: 'Photo uploaded',         emoji: '📷', needs: [] },
];
const STATUS_VALUES = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const triggerMeta = (t: NotificationTrigger) => TRIGGER_OPTIONS.find(o => o.value === t) || TRIGGER_OPTIONS[0];

const statusBadge = (s: string) => {
  if (s === 'SENT') return 'bg-green-100 text-green-700';
  if (s === 'FAILED') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
};

// ─────────────────────── Page ───────────────────────
export function NotifyPage() {
  const [tab, setTab] = useState<'rules' | 'logs' | 'test'>('rules');
  const [editingRule, setEditingRule] = useState<NotificationRule | 'new' | null>(null);
  const showToast = useToast((s) => s.show);
  const qc = useQueryClient();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">🔔 Notifications</h2>
          <p className="text-xs text-gray-500 mt-0.5">Telegram alerts triggered by schedule or events</p>
        </div>
        <div className="flex gap-2">
          {tab === 'rules' && (
            <button
              onClick={() => setEditingRule('new')}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
              + New rule
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <TabBtn active={tab === 'rules'} onClick={() => setTab('rules')}>📋 Rules</TabBtn>
        <TabBtn active={tab === 'logs'} onClick={() => setTab('logs')}>📜 Logs</TabBtn>
        <TabBtn active={tab === 'test'} onClick={() => setTab('test')}>🧪 Test connection</TabBtn>
      </div>

      {tab === 'rules' && <RulesTab onEdit={setEditingRule} />}
      {tab === 'logs' && <LogsTab />}
      {tab === 'test' && <TestTab />}

      {editingRule && (
        <RuleEditorModal
          rule={editingRule === 'new' ? null : editingRule}
          onClose={() => setEditingRule(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['notification-rules'] });
            setEditingRule(null);
            showToast('Rule saved');
          }}
        />
      )}
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

// ─────────────────────── Rules tab ───────────────────────
function RulesTab({ onEdit }: { onEdit: (r: NotificationRule | 'new') => void }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: notificationsApi.rules,
  });

  const toggle = useMutation({
    mutationFn: notificationsApi.toggle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-rules'] }),
  });

  const deleteRule = useMutation({
    mutationFn: notificationsApi.deleteRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-rules'] });
      showToast('Rule deleted');
    },
  });

  const sendNow = useMutation({
    mutationFn: ({ id, planId }: { id: string; planId?: string }) => notificationsApi.sendNow(id, planId),
    onSuccess: (res) => showToast(res.message || 'Queued'),
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed'),
  });

  const seedDefaults = useMutation({
    mutationFn: () => notificationsApi.seedDefaults(false),
    onSuccess: (res) => {
      showToast(res.message);
      qc.invalidateQueries({ queryKey: ['notification-rules'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed'),
  });

  if (isLoading) return <div className="py-10 text-center text-gray-400 text-sm">Loading rules…</div>;

  if (rules.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <div className="text-3xl mb-2">📭</div>
        <h3 className="font-medium text-gray-900 mb-1">No notification rules yet</h3>
        <p className="text-sm text-gray-500 mb-4">Get started by creating your first rule, or seed defaults.</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => onEdit('new')}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            + Create rule
          </button>
          <button onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
            {seedDefaults.isPending ? '…' : '🌱 Seed 8 default rules'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rules.map((r) => {
        const meta = triggerMeta(r.trigger);
        return (
          <div key={r.id}
            className={`bg-white rounded-lg border border-gray-200 p-3 hover:border-gray-300 transition-colors ${
              !r.enabled ? 'opacity-60' : ''
            }`}>
            <div className="flex items-start gap-3">
              <Switch on={r.enabled} onClick={() => toggle.mutate(r.id)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-base">{meta.emoji}</span>
                  <strong className="text-sm">{r.name}</strong>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                    {meta.label}
                  </span>
                </div>
                {r.description && <div className="text-xs text-gray-500 mb-1">{r.description}</div>}
                <div className="text-[10px] text-gray-400 flex items-center gap-3 flex-wrap">
                  <span>📨 {r.recipients.join(', ') || 'no recipients'}</span>
                  {r.triggerTime && <span>🕐 {r.triggerTime}</span>}
                  {r.triggerDay && <span>📅 {r.triggerDay}</span>}
                  {r.triggerCondition && <span>→ {r.triggerCondition}</span>}
                  {r.daysAhead != null && <span>{r.daysAhead}d ahead</span>}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => sendNow.mutate({ id: r.id })} disabled={sendNow.isPending}
                  title="Send now" className="px-2 py-1 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50">
                  📤
                </button>
                <button onClick={() => onEdit(r)}
                  title="Edit" className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                  ✏️
                </button>
                <button onClick={() => { if (confirm(`Delete "${r.name}"?`)) deleteRule.mutate(r.id); }}
                  title="Delete" className="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50">
                  🗑
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const Switch = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
  <div onClick={onClick}
    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer mt-0.5 ${
      on ? 'bg-green-500' : 'bg-gray-300'
    }`}>
    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
  </div>
);

// ─────────────────────── Logs tab ───────────────────────
function LogsTab() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['notification-logs', statusFilter],
    queryFn: () => notificationsApi.logs(statusFilter ? { status: statusFilter as any } : undefined),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 items-center">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded bg-white">
            <option value="">All statuses</option>
            <option value="SENT">SENT</option>
            <option value="FAILED">FAILED</option>
            <option value="PENDING">PENDING</option>
          </select>
          <span className="text-xs text-gray-500">{logs.length} entries</span>
        </div>
        <button onClick={() => refetch()}
          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">↻ Refresh</button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading logs…</div>
      ) : logs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          No notification logs yet
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="text-left py-2 px-3 font-medium">Time</th>
                  <th className="text-left py-2 px-3 font-medium">Rule</th>
                  <th className="text-left py-2 px-3 font-medium">Recipient</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Body / error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: NotificationLog) => (
                  <tr key={log.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="py-1.5 px-3 whitespace-nowrap text-gray-500">
                      {new Date(log.createdAt).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="py-1.5 px-3 font-medium">
                      {log.rule?.name || <span className="text-gray-400 italic">deleted</span>}
                    </td>
                    <td className="py-1.5 px-3">{log.recipient}</td>
                    <td className="py-1.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${statusBadge(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 max-w-[400px]">
                      {log.status === 'FAILED' ? (
                        <span className="text-red-600 truncate block" title={log.errorMessage || ''}>
                          {log.errorMessage}
                        </span>
                      ) : (
                        <span className="text-gray-500 truncate block" title={log.body}>
                          {log.body.split('\n')[0]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────── Test connection tab ───────────────────────
function TestTab() {
  const showToast = useToast((s) => s.show);
  const [recipient, setRecipient] = useState('PM Group');
  const [result, setResult] = useState<any>(null);

  const { data: recipients } = useQuery({
    queryKey: ['notification-recipients'],
    queryFn: notificationsApi.recipients,
  });

  const test = useMutation({
    mutationFn: () => notificationsApi.test(recipient),
    onSuccess: (res) => {
      setResult(res);
      showToast(res.success ? '✅ Test sent successfully' : `❌ ${res.message || 'Test failed'}`);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || 'Test failed';
      setResult({ success: false, message: msg });
      showToast('❌ ' + msg);
    },
  });

  const allRecipients = useMemo(() => [
    ...(recipients?.builtIns || []),
    ...(recipients?.teams || []),
  ], [recipients]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl">
      <h3 className="font-medium mb-3">🧪 Send a test message</h3>
      <p className="text-xs text-gray-500 mb-4">
        Tests Telegram delivery to the selected recipient. The bot must be a member of the target chat,
        and the chat ID must be configured (via env or team settings).
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">Telegram</label>
          <div className={`text-xs px-2 py-1.5 rounded inline-block ${
            recipients?.telegramConfigured ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {recipients?.telegramConfigured ? '✅ Bot token configured' : '❌ TELEGRAM_BOT_TOKEN not set in .env'}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">Recipient</label>
          <select value={recipient} onChange={(e) => setRecipient(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
            <optgroup label="Built-in groups">
              {recipients?.builtIns.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} {r.configured ? '✅' : '⚠️ not configured'}
                </option>
              ))}
            </optgroup>
            {recipients && recipients.teams.length > 0 && (
              <optgroup label="Teams">
                {recipients.teams.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} {t.configured ? '✅' : '⚠️ no chat ID'}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <button onClick={() => test.mutate()} disabled={test.isPending}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {test.isPending ? 'Sending…' : '📨 Send test'}
        </button>
      </div>

      {result && (
        <div className={`mt-4 p-3 rounded text-xs ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.success ? (
            <>
              ✅ Test message sent. Check your Telegram chat.
              {result.chatId && <div className="text-[10px] mt-1 opacity-70">Chat ID: {result.chatId}</div>}
            </>
          ) : (
            <>❌ {result.message || 'Failed to send'}</>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────── Rule editor modal ───────────────────────
function RuleEditorModal({ rule, onClose, onSaved }: {
  rule: NotificationRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const showToast = useToast((s) => s.show);
  const isEdit = !!rule;

  const [form, setForm] = useState<CreateRuleInput>(() => rule ? {
    name: rule.name,
    description: rule.description || '',
    enabled: rule.enabled,
    trigger: rule.trigger,
    triggerTime: rule.triggerTime || '08:00',
    triggerDay: rule.triggerDay || 'Monday',
    triggerCondition: rule.triggerCondition || 'CONFIRMED',
    daysAhead: rule.daysAhead || 3,
    recipients: rule.recipients,
    templateBody: rule.templateBody || '',
  } : {
    name: '',
    description: '',
    enabled: true,
    trigger: 'DAILY_AT',
    triggerTime: '08:00',
    triggerDay: 'Monday',
    triggerCondition: 'CONFIRMED',
    daysAhead: 3,
    recipients: ['PM Group'],
    templateBody: '',
  });

  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const runPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await notificationsApi.preview({
        trigger: form.trigger,
        templateBody: form.templateBody || undefined,
      });
      setPreviewMessage(result.message);
    } catch (e: any) {
      setPreviewError(e?.response?.data?.message || 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };


  const { data: recipients } = useQuery({
    queryKey: ['notification-recipients'],
    queryFn: notificationsApi.recipients,
  });

  const meta = triggerMeta(form.trigger);

  const save = useMutation({
    mutationFn: () => isEdit
      ? notificationsApi.updateRule(rule!.id, form)
      : notificationsApi.createRule(form),
    onSuccess: onSaved,
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to save'),
  });

  const toggleRecipient = (value: string) => {
    setForm((f) => ({
      ...f,
      recipients: f.recipients.includes(value)
        ? f.recipients.filter(r => r !== value)
        : [...f.recipients, value],
    }));
  };

  const submit = () => {
    if (!form.name?.trim()) { showToast('Name is required'); return; }
    if (form.recipients.length === 0) { showToast('Pick at least one recipient'); return; }
    // Clear unused fields based on trigger
    const payload: CreateRuleInput = {
      ...form,
      triggerTime: meta.needs.includes('triggerTime') ? form.triggerTime : null,
      triggerDay: meta.needs.includes('triggerDay') ? form.triggerDay : null,
      triggerCondition: meta.needs.includes('triggerCondition') ? form.triggerCondition : null,
      daysAhead: meta.needs.includes('daysAhead') ? form.daysAhead : null,
    };
    save.mutate(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">{isEdit ? '✏️ Edit rule' : '+ New notification rule'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 px-2">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Daily morning brief"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">Description</label>
            <input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>

          {/* Trigger */}
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">Trigger *</label>
            <select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as any })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
              ))}
            </select>
          </div>

          {/* Trigger-specific fields */}
          <div className="grid grid-cols-2 gap-3">
            {meta.needs.includes('triggerTime') && (
              <div>
                <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">Time (HH:mm)</label>
                <input type="time" value={form.triggerTime || ''}
                  onChange={(e) => setForm({ ...form, triggerTime: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
              </div>
            )}
            {meta.needs.includes('triggerDay') && (
              <div>
                <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">Day of week</label>
                <select value={form.triggerDay || ''} onChange={(e) => setForm({ ...form, triggerDay: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            {meta.needs.includes('triggerCondition') && (
              <div className="col-span-2">
                <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">When status becomes…</label>
                <select value={form.triggerCondition || ''}
                  onChange={(e) => setForm({ ...form, triggerCondition: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
                  {STATUS_VALUES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {meta.needs.includes('daysAhead') && (
              <div>
                <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">Days ahead</label>
                <input type="number" min="1" max="30"
                  value={form.daysAhead || 3}
                  onChange={(e) => setForm({ ...form, daysAhead: parseInt(e.target.value) || 3 })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
              </div>
            )}
          </div>

          {/* Recipients */}
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500 block mb-1">
              Recipients * <span className="text-gray-400">({form.recipients.length} selected)</span>
            </label>
            <div className="border border-gray-200 rounded p-2 max-h-[160px] overflow-y-auto space-y-1">
              <div className="text-[10px] text-gray-400 uppercase mb-1">Built-in groups</div>
              {recipients?.builtIns.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={form.recipients.includes(r.value)}
                    onChange={() => toggleRecipient(r.value)} className="rounded" />
                  <span className="flex-1">{r.label}</span>
                  {!r.configured && <span className="text-[10px] text-amber-600">⚠️ not configured</span>}
                </label>
              ))}
              {recipients && recipients.teams.length > 0 && (
                <>
                  <div className="text-[10px] text-gray-400 uppercase mb-1 mt-2">Teams</div>
                  {recipients.teams.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                      <input type="checkbox" checked={form.recipients.includes(r.value)}
                        onChange={() => toggleRecipient(r.value)} className="rounded" />
                      <span className="flex-1">{r.label}</span>
                      {!r.configured && <span className="text-[10px] text-amber-600">⚠️ no chat ID</span>}
                    </label>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Custom template body — VARIABLE_HINTS_BLOCK */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs uppercase tracking-wider text-gray-500">
                Custom template <span className="text-gray-400 normal-case">(empty = built-in default)</span>
              </label>
              <div className="flex items-center gap-2">
                {form.templateBody && (
                  <button type="button"
                    onClick={() => setForm({ ...form, templateBody: '' })}
                    className="text-[10px] text-gray-500 hover:text-red-600 underline">
                    ↺ Reset to default
                  </button>
                )}
                <button type="button"
                  onClick={runPreview}
                  disabled={previewLoading}
                  className="text-[10px] px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded font-medium disabled:opacity-50">
                  {previewLoading ? '…' : '👁 Preview'}
                </button>
              </div>
            </div>
            <textarea value={form.templateBody || ''}
              onChange={(e) => setForm({ ...form, templateBody: e.target.value })}
              rows={6}
              placeholder="🆕 *แผนใหม่ถูกสร้าง*&#10;{{plan.customer.customerName}} · {{plan.storeName}}&#10;วันติดตั้ง: {{plan.scheduledDate}}"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded font-mono resize-y" />
            <div className="mt-1.5 text-[10px] text-gray-500 leading-relaxed">
              <div className="font-semibold mb-0.5">Available variables:</div>
              <div className="flex flex-wrap gap-1">
                {[
                  // ─── Plan identity ───
                  '{{plan.storeName}}',
                  '{{plan.branchName}}',
                  '{{plan.address}}',
                  '{{plan.province}}',
                  // ─── Schedule ───
                  '{{plan.scheduledDate}}',
                  '{{plan.workStartTime}}',
                  '{{plan.workEndTime}}',
                  '{{plan.durationDays}}',
                  // ─── Equipment ───
                  '{{plan.sensorCount}}',
                  '{{plan.sensorModel}}',
                  '{{plan.poeSwitchModel}}',
                  '{{plan.workScope}}',
                  // ─── Contacts ───
                  '{{plan.contactPerson}}',
                  '{{plan.contactPhone}}',
                  '{{plan.contactEmail}}',
                  '{{plan.contactLine}}',
                  // ─── Relations ───
                  '{{plan.customer.customerName}}',
                  '{{plan.customer.customerCode}}',
                  '{{plan.department.departmentName}}',
                  '{{plan.team.name}}',
                  '{{plan.createdBy.fullName}}',
                  // ─── Reschedule context ───
                  '{{oldDate}}',
                  '{{newDate}}',
                  // ─── Team change context ───
                  '{{oldTeam.name}}',
                  '{{newTeam.name}}',
                  // ─── Photo upload context ───
                  '{{photo.category}}',
                  '{{photo.caption}}',
                  '{{uploadedBy.fullName}}',
                ].map((v) => (
                  <button key={v} type="button"
                    onClick={() => setForm({ ...form, templateBody: (form.templateBody || '') + v })}
                    className="px-1.5 py-0.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 rounded font-mono text-[9px] transition">
                    {v}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-gray-400">
                Tip: Telegram supports *bold*, _italic_, ~strikethrough~ via Markdown.
              </div>
            </div>
          </div>

          {(previewMessage || previewError) && (
            <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">📱 Telegram preview</div>
                <button type="button"
                  onClick={() => { setPreviewMessage(null); setPreviewError(null); }}
                  className="text-[10px] text-gray-400 hover:text-gray-700">✕ close</button>
              </div>
              {previewError ? (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded">⚠️ {previewError}</div>
              ) : (
                <div className="bg-[#d9fdd3] border border-green-200 rounded p-3 max-w-md whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-gray-900">
                  {previewMessage}
                </div>
              )}
            </div>
          )}

          {/* Enabled toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Rule enabled
          </label>
        </div>

        <div className="px-5 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-white">
            Cancel
          </button>
          <button onClick={submit} disabled={save.isPending}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
