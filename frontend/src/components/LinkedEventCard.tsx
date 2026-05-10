import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useToast } from './Toast';
import { LinkEventModal } from './LinkEventModal';

interface Props {
  planId: string;
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    venue?: string | null;
    organizer?: string | null;
    profile?: string;
    status?: string;
  } | null | undefined;
}

export function LinkedEventCard({ planId, event }: Props) {
  const navigate = useNavigate();
  const showToast = useToast((s) => s.show);
  const qc = useQueryClient();
  const [linkOpen, setLinkOpen] = useState(false);

  const unlinkMutation = useMutation({
    mutationFn: () => api.post(`/installation-plans/${planId}/unlink-event`).then((r) => r.data),
    onSuccess: () => {
      showToast('Unlinked from event');
      qc.invalidateQueries({ queryKey: ['plan', planId] });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to unlink'),
  });

  const fmtDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // Not linked → show "Link" button
  if (!event) {
    return (
      <>
        <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-700">🎪 No event linked</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              Link to an event to inherit dates, venue, and contact details
            </div>
          </div>
          <button type="button" onClick={() => setLinkOpen(true)}
            className="text-xs px-3 py-1.5 border border-blue-500 text-blue-700 rounded hover:bg-blue-50 bg-white">
            🔗 Link to event
          </button>
        </div>
        <LinkEventModal planId={planId} open={linkOpen} onClose={() => setLinkOpen(false)} />
      </>
    );
  }

  // Linked → show event card with unlink + open buttons
  return (
    <div className="border border-purple-200 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">🎪 Linked event</span>
            {event.profile && (
              <span className="text-[9px] uppercase font-mono text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
                {event.profile}
              </span>
            )}
            {event.status && (
              <span className="text-[9px] uppercase font-mono text-gray-600 bg-white border border-gray-300 px-1.5 py-0.5 rounded">
                {event.status}
              </span>
            )}
          </div>
          <h4 className="font-semibold text-base text-gray-900">{event.name}</h4>
          <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {event.organizer && <span>👤 {event.organizer}</span>}
            {event.venue && <span>📍 {event.venue}</span>}
            <span>📅 {fmtDate(event.startDate)} → {fmtDate(event.endDate)}</span>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button type="button" onClick={() => navigate(`/events/${event.id}`)}
            className="text-xs px-2.5 py-1 border border-purple-300 text-purple-700 rounded hover:bg-white">
            🔗 Open event
          </button>
          <button type="button"
            onClick={() => {
              if (confirm(`Unlink this plan from "${event.name}"?`)) {
                unlinkMutation.mutate();
              }
            }}
            disabled={unlinkMutation.isPending}
            className="text-xs px-2.5 py-1 border border-gray-300 text-gray-700 rounded hover:bg-white disabled:opacity-50">
            Unlink
          </button>
        </div>
      </div>
    </div>
  );
}
