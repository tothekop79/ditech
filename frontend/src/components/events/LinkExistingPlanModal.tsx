import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useToast } from '../Toast';

interface Props {
  eventId: string;
  eventName?: string;
  open: boolean;
  onClose: () => void;
}

interface AvailablePlan {
  id: string;
  storeName: string;
  branchName?: string | null;
  planStatus: string;
  scheduledDate?: string | null;
  customer?: { customerName: string; customerCode: string };
}

export function LinkExistingPlanModal({ eventId, eventName, open, onClose }: Props) {
  const showToast = useToast((s) => s.show);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>('');
  const [inheritFields, setInheritFields] = useState(true);
  const [search, setSearch] = useState('');

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['available-plans', eventId],
    queryFn: () =>
      api.get<{ success: boolean; data: AvailablePlan[] }>(`/events/${eventId}/available-plans`)
        .then((r) => r.data.data),
    enabled: open,
  });

  const filtered = plans.filter((p) =>
    !search ||
    p.storeName.toLowerCase().includes(search.toLowerCase()) ||
    (p.branchName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.customer?.customerName || '').toLowerCase().includes(search.toLowerCase()),
  );

  const linkMutation = useMutation({
    mutationFn: () =>
      api.post(`/installation-plans/${selectedId}/link-event`, {
        eventId,
        inheritFields,
      }).then((r) => r.data),
    onSuccess: () => {
      showToast('Plan linked to event');
      qc.invalidateQueries({ queryKey: ['linked-plans', eventId] });
      qc.invalidateQueries({ queryKey: ['available-plans', eventId] });
      qc.invalidateQueries({ queryKey: ['event', eventId] });
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to link'),
  });

  if (!open) return null;
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="fixed inset-0 bg-slate-800/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">📎 Link existing plan</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            เลือก plan ที่ยังไม่มี event ให้ link เข้ากับ <span className="font-medium">{eventName || 'this event'}</span>
          </p>
        </div>

        <div className="px-5 py-3 border-b">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 ค้นหา plan…"
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded outline-none focus:border-blue-400" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {isLoading ? (
            <div className="text-center text-sm text-gray-400 py-6">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-6">
              {plans.length === 0 ? 'No unlinked plans available' : 'No plans match search'}
            </div>
          ) : (
            filtered.map((p) => {
              const isSelected = selectedId === p.id;
              return (
                <button type="button" key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left px-3 py-2 rounded border transition ${
                    isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                  }`}>
                  <div className="flex items-center gap-2">
                    <input type="radio" checked={isSelected} readOnly />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900">
                        {p.storeName}
                        {p.branchName && <span className="text-gray-500"> · {p.branchName}</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                        {p.customer && <span>🏢 {p.customer.customerName}</span>}
                        <span>📅 {fmtDate(p.scheduledDate)}</span>
                        <span className="font-mono uppercase text-[9px] text-gray-400">{p.planStatus}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 border-t bg-gray-50">
          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={inheritFields}
              onChange={(e) => setInheritFields(e.target.checked)} className="mt-0.5" />
            <div>
              <div className="font-medium text-gray-900">Inherit event fields</div>
              <div className="text-[11px] text-gray-500">
                Plan dates, venue, contact, customer จะใช้ค่าจาก event
              </div>
            </div>
          </label>
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="text-sm px-4 py-1.5 border border-gray-300 rounded hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={() => linkMutation.mutate()}
            disabled={!selectedId || linkMutation.isPending}
            className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {linkMutation.isPending ? 'Linking…' : '🔗 Link plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
