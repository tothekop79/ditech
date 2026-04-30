import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plansApi } from '../api/plans';
import { masterApi } from '../api/master';
import { teamsApi } from '../api/teams';
import { useToast } from './Toast';

interface Props {
  // If duplicateFrom is provided, prefills form from existing plan
  duplicateFrom?: any;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

const STATUSES = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const READINESS = ['PENDING', 'NOT_READY', 'READY', 'ON_HOLD'];

export function CreatePlanModal({ duplicateFrom, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: masterApi.customers });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: masterApi.departments });
  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.list });

  const [form, setForm] = useState<any>({
    customerId: duplicateFrom?.customerId || '',
    departmentId: duplicateFrom?.departmentId || '',
    storeName: duplicateFrom?.storeName ? `${duplicateFrom.storeName} (copy)` : '',
    storeRegion: duplicateFrom?.storeRegion || 'BANGKOK',
    province: duplicateFrom?.province || '',
    address: duplicateFrom?.address || '',
    contactPerson: duplicateFrom?.contactPerson || '',
    contactPhone: duplicateFrom?.contactPhone || '',
    description: duplicateFrom?.description || 'install Cam',
    sensorCount: duplicateFrom?.sensorCount || 1,
    durationDays: duplicateFrom?.durationDays || 1,
    readiness: 'PENDING',
    planStatus: 'DRAFT',
    teamId: duplicateFrom?.teamId || '',
    scheduledDate: '',
    detail: duplicateFrom?.detail || '',
  });

  const create = useMutation({
    mutationFn: (asDraft: boolean) => {
      const payload: any = { ...form };
      if (asDraft) payload.planStatus = 'DRAFT';
      if (!payload.teamId) delete payload.teamId;
      if (!payload.scheduledDate) delete payload.scheduledDate;
      return plansApi.create(payload);
    },
    onSuccess: (created: any) => {
      showToast('Plan created');
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['plans-list'] });
      qc.invalidateQueries({ queryKey: ['gantt-plans'] });
      onCreated?.(created.id);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Create failed'),
  });

  const setField = (k: string, v: any) => setForm({ ...form, [k]: v });

  const valid = form.customerId && form.departmentId && form.storeName.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-medium">{duplicateFrom ? 'Duplicate plan' : 'Create new plan'}</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer *">
              <select value={form.customerId} onChange={(e) => setField('customerId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                <option value="">— Select customer —</option>
                {customers?.map((c: any) => <option key={c.id} value={c.id}>{c.customerCode}</option>)}
              </select>
            </Field>
            <Field label="Department *">
              <select value={form.departmentId} onChange={(e) => setField('departmentId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                <option value="">— Select department —</option>
                {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Store name *">
            <input value={form.storeName} onChange={(e) => setField('storeName', e.target.value)}
              placeholder="e.g. Central Bangna"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Region">
              <select value={form.storeRegion} onChange={(e) => setField('storeRegion', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                <option value="BANGKOK">BANGKOK</option>
                <option value="UPC">UPC</option>
              </select>
            </Field>
            <Field label="Province">
              <input value={form.province} onChange={(e) => setField('province', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </Field>
          </div>

          <Field label="Address">
            <input value={form.address} onChange={(e) => setField('address', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact person">
              <input value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </Field>
            <Field label="Contact phone">
              <input value={form.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </Field>
          </div>

          <Field label="Description">
            <input value={form.description} onChange={(e) => setField('description', e.target.value)}
              placeholder="install Cam, install Cam + Lan, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Sensor count">
              <input type="number" min="0" value={form.sensorCount}
                onChange={(e) => setField('sensorCount', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </Field>
            <Field label="Duration (days)">
              <input type="number" min="1" value={form.durationDays}
                onChange={(e) => setField('durationDays', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </Field>
            <Field label="Scheduled date">
              <input type="date" value={form.scheduledDate}
                onChange={(e) => setField('scheduledDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Status">
              <select value={form.planStatus} onChange={(e) => setField('planStatus', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Readiness">
              <select value={form.readiness} onChange={(e) => setField('readiness', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                {READINESS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Team (optional)">
              <select value={form.teamId} onChange={(e) => setField('teamId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                <option value="">— Unassigned —</option>
                {teams?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Detail / notes">
            <textarea value={form.detail} onChange={(e) => setField('detail', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </Field>
        </div>
        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
          <span className="text-xs text-gray-500">* Required fields</span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-white">
              Cancel
            </button>
            <button onClick={() => create.mutate(true)}
              disabled={!valid || create.isPending}
              className="px-4 py-2 border border-blue-500 text-blue-700 rounded text-sm hover:bg-blue-50 disabled:opacity-50">
              Save as draft
            </button>
            <button onClick={() => create.mutate(false)}
              disabled={!valid || create.isPending}
              className="px-4 py-2 bg-ditech-primary text-white rounded text-sm hover:bg-blue-800 disabled:opacity-50">
              {create.isPending ? 'Creating...' : 'Create plan'}
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
