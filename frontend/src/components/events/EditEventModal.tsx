import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, type Event, type EventProfile, PROFILE_DESC } from '../../api/events';
import { useToast } from '../Toast';

interface Props {
  event: Event;
  open: boolean;
  onClose: () => void;
}

export function EditEventModal({ event, open, onClose }: Props) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const [form, setForm] = useState({
    name: event.name,
    organizer: event.organizer || '',
    venue: event.venue || '',
    venueType: event.venueType || 'Booth',
    startDate: event.startDate ? event.startDate.slice(0, 10) : '',
    endDate: event.endDate ? event.endDate.slice(0, 10) : '',
    profile: event.profile,
    description: event.description || '',
    confidential: event.confidential,
    showPasserby: event.showPasserby,
    systemCredit: event.systemCredit || 'AI People Counting',
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: event.name,
        organizer: event.organizer || '',
        venue: event.venue || '',
        venueType: event.venueType || 'Booth',
        startDate: event.startDate ? event.startDate.slice(0, 10) : '',
        endDate: event.endDate ? event.endDate.slice(0, 10) : '',
        profile: event.profile,
        description: event.description || '',
        confidential: event.confidential,
        showPasserby: event.showPasserby,
        systemCredit: event.systemCredit || 'AI People Counting',
      });
    }
  }, [open, event.id]);

  const save = useMutation({
    mutationFn: () =>
      eventsApi.update(event.id, {
        name: form.name.trim(),
        organizer: form.organizer.trim() || undefined,
        venue: form.venue.trim() || undefined,
        venueType: form.venueType.trim() || 'Booth',
        startDate: form.startDate,
        endDate: form.endDate,
        profile: form.profile,
        description: form.description.trim() || undefined,
        confidential: form.confidential,
        showPasserby: form.showPasserby,
        systemCredit: form.systemCredit.trim() || undefined,
      } as any),
    onSuccess: () => {
      showToast('Event updated');
      qc.invalidateQueries({ queryKey: ['event', event.id] });
      qc.invalidateQueries({ queryKey: ['events'] });
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to update'),
  });

  if (!open) return null;

  const dateRangeChanged =
    form.startDate !== event.startDate.slice(0, 10) ||
    form.endDate !== event.endDate.slice(0, 10);

  return (
    <div className="fixed inset-0 bg-slate-800/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">✏️ Edit event</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              แก้ไขข้อมูลพื้นฐานของ event
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label="Event name *">
            <input value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Organizer">
              <input value={form.organizer}
                onChange={(e) => setForm({ ...form, organizer: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </Field>
            <Field label="Venue">
              <input value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Venue type">
              <input value={form.venueType}
                onChange={(e) => setForm({ ...form, venueType: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </Field>
            <Field label="Start date *">
              <input type="date" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </Field>
            <Field label="End date *">
              <input type="date" value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </Field>
          </div>

          {dateRangeChanged && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              ⚠ เปลี่ยน date range — Days configuration ในแท็บ Config จะไม่ถูกแก้อัตโนมัติ
              ต้องไป Config tab → แก้ Days ให้ตรง
            </div>
          )}

          <Field label="Profile">
            <select value={form.profile}
              onChange={(e) => setForm({ ...form, profile: e.target.value as EventProfile })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
              <option value="SIMPLE">SIMPLE — {PROFILE_DESC.SIMPLE}</option>
              <option value="STANDARD">STANDARD — {PROFILE_DESC.STANDARD}</option>
              <option value="FULL">FULL — {PROFILE_DESC.FULL}</option>
            </select>
          </Field>

          <Field label="System credit">
            <input value={form.systemCredit}
              onChange={(e) => setForm({ ...form, systemCredit: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </Field>

          <Field label="Description">
            <textarea value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded resize-none" />
          </Field>

          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.confidential}
                onChange={(e) => setForm({ ...form, confidential: e.target.checked })} />
              Mark as confidential
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.showPasserby}
                onChange={(e) => setForm({ ...form, showPasserby: e.target.checked })} />
              Show passerby data
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-gray-50 rounded-b-xl flex justify-end gap-2">
          <button onClick={onClose}
            className="text-sm px-4 py-1.5 border border-gray-300 rounded hover:bg-white">
            Cancel
          </button>
          <button onClick={() => save.mutate()}
            disabled={save.isPending || !form.name.trim() || !form.startDate || !form.endDate}
            className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {save.isPending ? 'Saving…' : '✓ Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: any }) => (
  <div>
    <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">{label}</label>
    {children}
  </div>
);
