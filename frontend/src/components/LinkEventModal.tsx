import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, type Event } from '../api/events';
import { api } from '../api/client';
import { useToast } from './Toast';

interface Props {
  planId: string;
  open: boolean;
  onClose: () => void;
  onLinked?: () => void;
}

export function LinkEventModal({ planId, open, onClose, onLinked }: Props) {
  const showToast = useToast((s) => s.show);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>('');
  const [inheritFields, setInheritFields] = useState(true);
  const [search, setSearch] = useState('');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events-list-for-link'],
    queryFn: () => eventsApi.list(),
    enabled: open,
  });

  const filtered = events.filter((e) =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.organizer || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.venue || '').toLowerCase().includes(search.toLowerCase()),
  );

  const linkMutation = useMutation({
    mutationFn: () =>
      api.post(`/installation-plans/${planId}/link-event`, {
        eventId: selectedId,
        inheritFields,
      }).then((r) => r.data),
    onSuccess: () => {
      showToast('Linked to event');
      qc.invalidateQueries({ queryKey: ['plan', planId] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      onLinked?.();
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to link'),
  });

  if (!open) return null;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const selected = events.find((e) => e.id === selectedId);

  return (
    <div className="fixed inset-0 bg-slate-800/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">🎪 Link plan to event</h3>
          <p className="text-xs text-gray-500 mt-0.5">เลือก event ที่ plan นี้เป็นส่วนหนึ่ง</p>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 ค้นหา event…"
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded outline-none focus:border-blue-400" />
        </div>

        {/* Event list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {isLoading ? (
            <div className="text-center text-sm text-gray-400 py-6">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-6">No events found</div>
          ) : (
            filtered.map((ev) => {
              const isSelected = selectedId === ev.id;
              return (
                <button type="button" key={ev.id}
                  onClick={() => setSelectedId(ev.id)}
                  className={`w-full text-left px-3 py-2 rounded border transition ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                  }`}>
                  <div className="flex items-center gap-2">
                    <input type="radio" checked={isSelected} readOnly />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900">{ev.name}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                        {ev.organizer && <span>👤 {ev.organizer}</span>}
                        {ev.venue && <span>📍 {ev.venue}</span>}
                        <span>📅 {fmtDate(ev.startDate)} → {fmtDate(ev.endDate)}</span>
                        <span className="font-mono uppercase text-[9px] text-gray-400">{ev.profile}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Inherit toggle + warning */}
        <div className="px-5 py-3 border-t bg-gray-50 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={inheritFields}
              onChange={(e) => setInheritFields(e.target.checked)}
              className="mt-0.5" />
            <div>
              <div className="font-medium text-gray-900">Inherit fields from event</div>
              <div className="text-[11px] text-gray-500">
                Plan จะได้ค่า: scheduledDate, durationDays, address, contactPerson, customer
              </div>
            </div>
          </label>
          {inheritFields && selected && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              ⚠ ค่าเดิมของ Plan ในฟิลด์เหล่านี้จะถูกแทนที่ด้วยข้อมูลจาก{' '}
              <span className="font-medium">{selected.name}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="text-sm px-4 py-1.5 border border-gray-300 rounded hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={() => linkMutation.mutate()}
            disabled={!selectedId || linkMutation.isPending}
            className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {linkMutation.isPending ? 'Linking…' : '🔗 Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
