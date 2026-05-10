import { useQuery, useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { eventsApi } from '../../api/events';
import { api } from '../../api/client';
import { useToast } from '../Toast';

interface Check {
  level: 'success' | 'warning' | 'error' | 'info';
  label: string;
  detail?: string;
  ok: boolean;
}

interface Props {
  eventId: string;
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

export function VerifyBeforeGenerateModal({ eventId, open, onClose, onConfirmed }: Props) {
  const showToast = useToast((s) => s.show);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['event-verify', eventId],
    queryFn: () =>
      api
        .post<{ success: boolean; data: { checks: Check[]; canGenerate: boolean } }>(`/events/${eventId}/verify`)
        .then((r) => r.data.data),
    enabled: open,
  });

  // Re-run verify whenever the modal is opened
  useEffect(() => {
    if (open) refetch();
  }, [open]);

  if (!open) return null;

  const checks = data?.checks || [];
  const canGenerate = data?.canGenerate ?? false;
  const errors = checks.filter((c) => c.level === 'error');
  const warnings = checks.filter((c) => c.level === 'warning');
  const successes = checks.filter((c) => c.level === 'success');
  const infos = checks.filter((c) => c.level === 'info');

  return (
    <div className="fixed inset-0 bg-slate-800/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">🔍 Verify before generate</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              ตรวจสอบข้อมูลให้ครบถ้วนและถูกต้องก่อนที่จะสร้างรายงาน
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="py-8 text-center text-gray-500">
              <div className="inline-block w-6 h-6 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-2" />
              <div className="text-sm">Inspecting Rawdata.xlsx and config…</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary banner */}
              {errors.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <div className="font-semibold text-sm text-red-800">
                    ⛔ {errors.length} blocking issue{errors.length !== 1 ? 's' : ''} — please fix before generating
                  </div>
                </div>
              ) : warnings.length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <div className="font-semibold text-sm text-amber-800">
                    ⚠ {warnings.length} warning{warnings.length !== 1 ? 's' : ''} — review before generating
                  </div>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Generation will proceed but some data may be ignored or incomplete.
                  </p>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <div className="font-semibold text-sm text-green-800">
                    ✅ All checks passed — ready to generate
                  </div>
                </div>
              )}

              {/* Errors */}
              {errors.length > 0 && (
                <CheckGroup title="Errors" items={errors} icon="❌" tone="red" />
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <CheckGroup title="Warnings" items={warnings} icon="⚠" tone="amber" />
              )}

              {/* Successes */}
              {successes.length > 0 && (
                <CheckGroup title="Passed" items={successes} icon="✅" tone="green" collapsible />
              )}

              {/* Info */}
              {infos.length > 0 && (
                <CheckGroup title="Info" items={infos} icon="ℹ️" tone="gray" collapsible />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-gray-50 rounded-b-xl flex items-center justify-between gap-3">
          <button onClick={() => refetch()}
            disabled={isLoading}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50">
            ↻ Re-check
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="text-sm px-4 py-1.5 border border-gray-300 rounded hover:bg-white">
              Cancel
            </button>
            <button
              onClick={() => { onConfirmed(); onClose(); }}
              disabled={!canGenerate || isLoading}
              title={!canGenerate ? 'Fix the blocking issues first' : ''}
              className="text-sm px-4 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
              ✨ Generate report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Check group ──
interface GroupProps {
  title: string;
  items: Check[];
  icon: string;
  tone: 'red' | 'amber' | 'green' | 'gray';
  collapsible?: boolean;
}
function CheckGroup({ title, items, icon, tone, collapsible }: GroupProps) {
  const colors = {
    red: 'border-red-200 bg-red-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    green: 'border-green-200 bg-white',
    gray: 'border-gray-200 bg-white',
  }[tone];

  return (
    <details open={!collapsible} className={`border rounded ${colors}`}>
      <summary className="px-3 py-2 text-xs font-semibold cursor-pointer text-gray-700">
        {title} <span className="text-gray-400 font-normal">({items.length})</span>
      </summary>
      <ul className="px-3 pb-2 space-y-1.5">
        {items.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900">{c.label}</div>
              {c.detail && (
                <div className="text-gray-500 mt-0.5 break-words">{c.detail}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
