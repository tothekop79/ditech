import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plansApi } from '../api/plans';
import { teamsApi } from '../api/teams';
import { useToast } from './Toast';

interface Props {
  planId: string | null;
  onClose: () => void;
}

export function PlanEditModal({ planId, onClose }: Props) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [form, setForm] = useState<any>({});
  const [hasChanged, setHasChanged] = useState(false);

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => plansApi.get(planId!),
    enabled: !!planId,
  });

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: teamsApi.list,
  });

  useEffect(() => {
    if (plan) {
      setForm({
        readiness: plan.readiness || 'PENDING',
        planStatus: plan.planStatus || 'DRAFT',
        scheduledDate: plan.scheduledDate ? plan.scheduledDate.substring(0, 10) : '',
        teamId: plan.teamId || '',
        contactPerson: plan.contactPerson || '',
        contactPhone: plan.contactPhone || '',
        sensorCount: plan.sensorCount || 0,
        detail: plan.detail || '',
        readinessNote: plan.readinessNote || '',
      });
      setHasChanged(false);
    }
  }, [plan]);

  const update = useMutation({
    mutationFn: (data: any) => plansApi.update(planId!, data),
    onSuccess: () => {
      showToast('Plan updated');
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['plan', planId] });
      qc.invalidateQueries({ queryKey: ['heatmap'] });
      qc.invalidateQueries({ queryKey: ['capacity'] });
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Update failed'),
  });

  const setField = (key: string, value: any) => {
    setForm((f: any) => ({ ...f, [key]: value }));
    setHasChanged(true);
  };

  const save = () => {
    const payload: any = { ...form };
    if (!payload.teamId) payload.teamId = null;
    if (!payload.scheduledDate) delete payload.scheduledDate;
    update.mutate(payload);
  };

  if (!planId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Edit plan</h2>
            {plan && (
              <p className="text-sm text-gray-500">
                {plan.customer?.customerCode} · {plan.department?.departmentName} · {plan.storeName}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <select value={form.planStatus} onChange={(e) => setField('planStatus', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  <option value="DRAFT">DRAFT</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </Field>

              <Field label="Readiness">
                <select value={form.readiness} onChange={(e) => setField('readiness', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  <option value="PENDING">PENDING</option>
                  <option value="NOT_READY">NOT_READY</option>
                  <option value="READY">READY</option>
                  <option value="ON_HOLD">ON_HOLD</option>
                </select>
              </Field>

              <Field label="Scheduled date">
                <input type="date" value={form.scheduledDate}
                  onChange={(e) => setField('scheduledDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </Field>

              <Field label="Team">
                <select value={form.teamId} onChange={(e) => setField('teamId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                  <option value="">— Unassigned —</option>
                  {teams?.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t._count?.members ?? 0} members)
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Contact person">
                <input value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </Field>

              <Field label="Contact phone">
                <input value={form.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </Field>

              <Field label="Sensor count">
                <input type="number" value={form.sensorCount}
                  onChange={(e) => setField('sensorCount', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </Field>

              <Field label="Readiness note">
                <input value={form.readinessNote} onChange={(e) => setField('readinessNote', e.target.value)}
                  placeholder="why not ready / on hold reason"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </Field>

              <div className="col-span-2">
                <Field label="Detail / notes">
                  <textarea value={form.detail} onChange={(e) => setField('detail', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </Field>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {hasChanged ? 'Unsaved changes' : 'No changes'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-white">
              Cancel
            </button>
            <button onClick={save} disabled={!hasChanged || update.isPending}
              className="px-4 py-2 bg-ditech-primary text-white rounded text-sm hover:bg-blue-800 disabled:opacity-50">
              {update.isPending ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
