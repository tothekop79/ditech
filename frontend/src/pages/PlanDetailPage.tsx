import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import GenerateDocModal from '../components/GenerateDocModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plansApi } from '../api/plans';
import { teamsApi } from '../api/teams';
import { CreatePlanModal } from '../components/CreatePlanModal';
import { LinkedEventCard } from '../components/LinkedEventCard';
import { PhotosSection } from '../components/PhotosSection';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { useToast } from '../components/Toast';

const STATUSES = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const READINESS = ['PENDING', 'NOT_READY', 'READY', 'ON_HOLD'];
const REGIONS = ['BANGKOK', 'UPC'];
const WORK_SCOPES = [
  { value: 'INSTALL_CAMERA', label: '📷 Install Camera', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'INSTALL_LAN',    label: '🔌 Install LAN',    color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'INSTALL_POE',    label: '⚡ Install POE',    color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'CALIBRATION',    label: '🎯 Calibration',    color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'TESTING',        label: '✓ Testing',         color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'CLOUD_SETUP',    label: '☁️ Cloud Setup',    color: 'bg-sky-100 text-sky-700 border-sky-300' },
  { value: 'MAINTENANCE',    label: '🔧 Maintenance',    color: 'bg-orange-100 text-orange-700 border-orange-300' },
];

const PROVINCES_EN = [
  'Amnat Charoen','Ang Thong','Bangkok','Bueng Kan','Buri Ram','Chachoengsao','Chai Nat',
  'Chaiyaphum','Chanthaburi','Chiang Mai','Chiang Rai','Chonburi','Chumphon','Kalasin',
  'Kamphaeng Phet','Kanchanaburi','Khon Kaen','Krabi','Lampang','Lamphun','Loei','Lopburi',
  'Mae Hong Son','Maha Sarakham','Mukdahan','Nakhon Nayok','Nakhon Pathom','Nakhon Phanom',
  'Nakhon Ratchasima','Nakhon Sawan','Nakhon Si Thammarat','Nan','Narathiwat','Nong Bua Lamphu',
  'Nong Khai','Nonthaburi','Pathum Thani','Pattani','Phang Nga','Phatthalung','Phayao','Phetchabun',
  'Phetchaburi','Phichit','Phitsanulok','Phra Nakhon Si Ayutthaya','Phrae','Phuket','Prachinburi',
  'Prachuap Khiri Khan','Ranong','Ratchaburi','Rayong','Roi Et','Sa Kaeo','Sakon Nakhon',
  'Samut Prakan','Samut Sakhon','Samut Songkhram','Saraburi','Satun','Sing Buri','Sisaket',
  'Songkhla','Sukhothai','Suphan Buri','Surat Thani','Surin','Tak','Trang','Trat','Ubon Ratchathani',
  'Udon Thani','Uthai Thani','Uttaradit','Yala','Yasothon',
];

const readinessChip = (r?: string) => {
  if (r === 'READY') return 'bg-green-100 text-green-700 border-green-300';
  if (r === 'NOT_READY') return 'bg-red-100 text-red-700 border-red-300';
  if (r === 'ON_HOLD') return 'bg-orange-100 text-orange-700 border-orange-300';
  return 'bg-gray-100 text-gray-600 border-gray-300';
};
const statusChip = (s?: string) => {
  if (s === 'COMPLETED') return 'bg-green-100 text-green-700 border-green-300';
  if (s === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700 border-blue-300';
  if (s === 'CONFIRMED') return 'bg-purple-100 text-purple-700 border-purple-300';
  if (s === 'CANCELLED') return 'bg-red-100 text-red-700 border-red-300';
  return 'bg-gray-100 text-gray-600 border-gray-300';
};
const regionChip = (r?: string) =>
  r === 'BANGKOK' ? 'bg-sky-100 text-sky-700 border-sky-300' : 'bg-amber-100 text-amber-700 border-amber-300';

// ──────────────────────────────────────────────────────
//   Reusable card scaffold
// ──────────────────────────────────────────────────────
interface CardProps {
  title: string;
  icon?: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  children: React.ReactNode;
}
function EditableCard({ title, icon, editing, onEdit, onCancel, onSave, saving, children }: CardProps) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-medium text-sm">
          {icon && <span className="text-gray-400 mr-1.5">{icon}</span>}
          {title}
        </h3>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={onSave} disabled={saving}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <button onClick={onEdit} title="Edit" className="text-gray-400 hover:text-blue-600 text-sm">✏️</button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const Field = ({ label, children }: any) => (
  <div>
    <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">{label}</div>
    <div className="text-sm text-gray-900">{children ?? <span className="text-gray-300">—</span>}</div>
  </div>
);

// ──────────────────────────────────────────────────────
//   Main page
// ──────────────────────────────────────────────────────
export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plan', id],
    queryFn: () => plansApi.get(id!),
    enabled: !!id,
  });
  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.list });

  const updateMutation = useMutation({
    mutationFn: (data: any) => plansApi.update(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', id] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      showToast('Saved');
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to save'),
  });
  const deleteMutation = useMutation({
    mutationFn: () => plansApi.delete(id!),
    onSuccess: () => { showToast('Plan deleted'); navigate('/plans'); },
  });

  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);

  if (isLoading) return <div className="py-20 text-center text-gray-400">Loading...</div>;
  if (!plan) return <div className="py-20 text-center text-gray-400">Plan not found</div>;

  return (
    <div>
      {/* ───── Top action bar ───── */}
      <div className="flex items-center justify-between mb-4">
        <Link to="/plans" className="text-sm text-blue-600 hover:underline">← Back to plans</Link>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/designs/by-plan/${id}`)}
            className="px-3 py-1.5 text-sm border border-purple-500 text-purple-700 rounded inline-flex items-center gap-1.5 hover:bg-purple-50 bg-white">
            📐 Coverage Design
          </button>
          <button onClick={() => setShowDocModal(true)}
            className="px-3 py-1.5 text-sm border border-blue-500 text-blue-700 rounded inline-flex items-center gap-1.5 hover:bg-blue-50 bg-white">
            📄 Generate doc
          </button>
          <button onClick={() => setShowDuplicate(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
            📋 Duplicate
          </button>
          <button onClick={() => {
            if (confirm('Delete this plan? This cannot be undone.')) deleteMutation.mutate();
          }}
            className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50">
            🗑 Delete
          </button>
        </div>
      </div>

      {/* ───── Header summary card ───── */}
      <div className="border border-gray-200 rounded-lg bg-white p-4 mb-4">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${regionChip(plan.storeRegion)}`}>
            {plan.storeRegion}
          </span>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${readinessChip(plan.readiness)}`}>
            {plan.readiness}
          </span>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${statusChip(plan.planStatus)}`}>
            {plan.planStatus}
          </span>
        </div>
        <h2 className="text-xl font-semibold">{plan.storeName}</h2>
        <p className="text-sm text-gray-600">
          {plan.customer?.customerCode} · {plan.department?.departmentName}
          {plan.branchName && ` · ${plan.branchName}`}
        </p>
      </div>

      {/* ───── 2-col main grid: left content + right activity ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          <LinkedEventCard planId={plan.id} event={plan.event ? {
            id: plan.event.id,
            name: plan.event.name,
            startDate: plan.event.startDate,
            endDate: plan.event.endDate,
            venue: plan.event.venue,
            organizer: plan.event.organizer,
            profile: plan.event.profile,
            status: plan.event.status,
          } : null} />
          {/* 3-col status/schedule/team */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatusCard plan={plan} updateMutation={updateMutation} />
            <ScheduleCard plan={plan} updateMutation={updateMutation} />
            <TeamCard plan={plan} teams={teams} updateMutation={updateMutation} />
          </div>

          <StoreCard plan={plan} updateMutation={updateMutation} />
          <EquipmentCard plan={plan} updateMutation={updateMutation} />
          <NotesCard plan={plan} updateMutation={updateMutation} />

          <PhotosSection planId={plan.id} />
        </div>

        {/* RIGHT (1/3) — sticky activity log */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-4">
            <ActivityTimeline
              planId={plan.id}
              statusHistory={plan.statusHistory || []}
              createdAt={plan.createdAt}
              createdBy={plan.createdBy}
            />
          </div>
        </div>
      </div>

      {showDuplicate && (
        <CreatePlanModal sourcePlan={plan} onClose={() => setShowDuplicate(false)} />
      )}
      <GenerateDocModal planId={id!} open={showDocModal} onClose={() => setShowDocModal(false)} />
    </div>
  );
}

// ──────────────────────────────────────────────────────
//   Card 1 — Status (Plan status + Readiness + Note)
// ──────────────────────────────────────────────────────
function StatusCard({ plan, updateMutation }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    planStatus: plan.planStatus, readiness: plan.readiness, readinessNote: plan.readinessNote || '',
  });
  useEffect(() => {
    if (!editing) setForm({
      planStatus: plan.planStatus, readiness: plan.readiness, readinessNote: plan.readinessNote || '',
    });
  }, [plan, editing]);

  const save = () => updateMutation.mutate({
    planStatus: form.planStatus,
    readiness: form.readiness,
    readinessNote: form.readinessNote || undefined,
  }, { onSuccess: () => setEditing(false) });

  return (
    <EditableCard title="Status" icon="🏷️" editing={editing}
      onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}
      onSave={save} saving={updateMutation.isPending}>
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Plan status</label>
            <select value={form.planStatus} onChange={(e) => setForm({ ...form, planStatus: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Readiness</label>
            <select value={form.readiness} onChange={(e) => setForm({ ...form, readiness: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
              {READINESS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Note</label>
            <input value={form.readinessNote} onChange={(e) => setForm({ ...form, readinessNote: e.target.value })}
              placeholder="Why not ready / on hold..."
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Plan">{plan.planStatus}</Field>
          <Field label="Readiness">{plan.readiness}</Field>
          <Field label="Note">{plan.readinessNote || null}</Field>
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────
//   Card 2 — Schedule
// ──────────────────────────────────────────────────────
function ScheduleCard({ plan, updateMutation }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    scheduledDate: plan.scheduledDate ? plan.scheduledDate.substring(0, 10) : '',
    durationDays: plan.durationDays || 1,
    completedDate: plan.completedDate ? plan.completedDate.substring(0, 10) : '',
    workStartTime: plan.workStartTime || '',
    workEndTime: plan.workEndTime || '',
    notPlanned: !plan.scheduledDate,
  });
  useEffect(() => {
    if (!editing) setForm({
      scheduledDate: plan.scheduledDate ? plan.scheduledDate.substring(0, 10) : '',
      durationDays: plan.durationDays || 1,
      completedDate: plan.completedDate ? plan.completedDate.substring(0, 10) : '',
      workStartTime: plan.workStartTime || '',
      workEndTime: plan.workEndTime || '',
      notPlanned: !plan.scheduledDate,
    });
  }, [plan, editing]);

  const save = () => updateMutation.mutate({
    scheduledDate: form.notPlanned ? null : (form.scheduledDate || null),
    completedDate: form.completedDate || null,
    durationDays: parseInt(String(form.durationDays)) || 1,
    workStartTime: form.workStartTime || null,
    workEndTime: form.workEndTime || null,
  }, { onSuccess: () => setEditing(false) });

  const formatDate = (d?: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <EditableCard title="Schedule" icon="📅" editing={editing}
      onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}
      onSave={save} saving={updateMutation.isPending}>
      {editing ? (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={form.notPlanned}
              onChange={(e) => setForm({ ...form, notPlanned: e.target.checked, scheduledDate: e.target.checked ? '' : form.scheduledDate })} />
            Not yet planned
          </label>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Scheduled date</label>
            <input type="date" value={form.scheduledDate} disabled={form.notPlanned}
              onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Duration (days)</label>
            <input type="number" min="1" value={form.durationDays}
              onChange={(e) => setForm({ ...form, durationDays: parseInt(e.target.value) || 1 })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Work start time</label>
              <input type="time" value={form.workStartTime}
                onChange={(e) => setForm({ ...form, workStartTime: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Work end time</label>
              <input type="time" value={form.workEndTime}
                onChange={(e) => setForm({ ...form, workEndTime: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Completed date</label>
            <input type="date" value={form.completedDate}
              onChange={(e) => setForm({ ...form, completedDate: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Scheduled">
            {plan.scheduledDate ? formatDate(plan.scheduledDate) : <span className="text-gray-400 italic">Not yet planned</span>}
          </Field>
          <Field label="Duration">{plan.durationDays || 1} day{(plan.durationDays || 1) > 1 ? 's' : ''}</Field>
          {(plan.workStartTime || plan.workEndTime) && (
            <Field label="Work hours">{plan.workStartTime || '—'} – {plan.workEndTime || '—'}</Field>
          )}
          <Field label="Completed">{formatDate(plan.completedDate)}</Field>
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────
//   Card 3 — Team & Crew
// ──────────────────────────────────────────────────────
function TeamCard({ plan, teams, updateMutation }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    teamId: plan.teamId || '',
    contractorName: plan.contractorName || '',
  });
  useEffect(() => {
    if (!editing) setForm({ teamId: plan.teamId || '', contractorName: plan.contractorName || '' });
  }, [plan, editing]);

  const save = () => updateMutation.mutate({
    teamId: form.teamId || null,
    contractorName: form.contractorName || undefined,
  }, { onSuccess: () => setEditing(false) });

  const team = (teams || []).find((t: any) => t.id === plan.teamId);
  const lead = team?.leadUser;

  return (
    <EditableCard title="Team & Crew" icon="👥" editing={editing}
      onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}
      onSave={save} saving={updateMutation.isPending}>
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Team</label>
            <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
              <option value="">— Unassigned —</option>
              {(teams || []).map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.region})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">External contractor</label>
            <input value={form.contractorName} onChange={(e) => setForm({ ...form, contractorName: e.target.value })}
              placeholder="Optional"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Team">
            {plan.team ? plan.team.name : <span className="text-gray-400">Unassigned</span>}
          </Field>
          {lead && (
            <Field label="Lead">⭐ {lead.fullName}</Field>
          )}
          {team?.members && team.members.length > 0 && (
            <Field label={`Members (${team.members.length})`}>
              <ul className="text-xs text-gray-600 mt-0.5 space-y-0.5">
                {team.members.slice(0, 3).map((m: any) => (
                  <li key={m.user.id}>{m.user.fullName}</li>
                ))}
                {team.members.length > 3 && <li className="italic text-gray-400">+{team.members.length - 3} more</li>}
              </ul>
            </Field>
          )}
          <Field label="External contractor">{plan.contractorName || null}</Field>
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────
//   Card 4 — Store Information & Contact (full-width)
// ──────────────────────────────────────────────────────
function StoreCard({ plan, updateMutation }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    storeName: plan.storeName || '',
    branchName: plan.branchName || '',
    storeRegion: plan.storeRegion || 'BANGKOK',
    province: plan.province || '',
    address: plan.address || '',
    contactPerson: plan.contactPerson || '',
    contactPhone: plan.contactPhone || '',
    contactEmail: plan.contactEmail || '',
    contactLine: plan.contactLine || '',
  });
  useEffect(() => {
    if (!editing) setForm({
      storeName: plan.storeName || '', branchName: plan.branchName || '',
      storeRegion: plan.storeRegion || 'BANGKOK', province: plan.province || '',
      address: plan.address || '', contactPerson: plan.contactPerson || '',
      contactPhone: plan.contactPhone || '', contactEmail: plan.contactEmail || '',
      contactLine: plan.contactLine || '',
    });
  }, [plan, editing]);

  const save = () => updateMutation.mutate({
    storeName: form.storeName, branchName: form.branchName || null,
    storeRegion: form.storeRegion, province: form.province || undefined,
    address: form.address || undefined, contactPerson: form.contactPerson || undefined,
    contactPhone: form.contactPhone || undefined, contactEmail: form.contactEmail || null,
    contactLine: form.contactLine || null,
  }, { onSuccess: () => setEditing(false) });

  return (
    <EditableCard title="Store Information & Contact" icon="🏪" editing={editing}
      onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}
      onSave={save} saving={updateMutation.isPending}>
      {editing ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Store name *</label>
            <input value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Branch name</label>
            <input value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Region</label>
            <select value={form.storeRegion} onChange={(e) => setForm({ ...form, storeRegion: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Province</label>
            <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
              <option value="">— Select —</option>
              {PROVINCES_EN.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Contact person</label>
            <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Phone</label>
            <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Email</label>
            <input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Line ID</label>
            <input value={form.contactLine} onChange={(e) => setForm({ ...form, contactLine: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Store name">{plan.storeName}</Field>
          <Field label="Branch">{plan.branchName}</Field>
          <Field label="Customer">{plan.customer?.customerName || plan.customer?.customerCode}</Field>

          <Field label="Department">{plan.department?.departmentName}</Field>
          <Field label="Region">{plan.storeRegion}</Field>
          <Field label="Province">{plan.province}</Field>

          <div className="md:col-span-3"><Field label="Address">{plan.address}</Field></div>

          <Field label="Contact person">{plan.contactPerson}</Field>
          <Field label="Phone">{plan.contactPhone}</Field>
          <Field label="Email">{plan.contactEmail}</Field>

          <Field label="Line ID">{plan.contactLine}</Field>
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────
//   Card 5 — Equipment & Work Scope (full-width)
// ──────────────────────────────────────────────────────
function EquipmentCard({ plan, updateMutation }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    sensorCount: plan.sensorCount || 0,
    sensorModel: plan.sensorModel || '',
    poeSwitchModel: plan.poeSwitchModel || '',
    workScope: plan.workScope || [],
  });
  useEffect(() => {
    if (!editing) setForm({
      sensorCount: plan.sensorCount || 0,
      sensorModel: plan.sensorModel || '',
      poeSwitchModel: plan.poeSwitchModel || '',
      workScope: plan.workScope || [],
    });
  }, [plan, editing]);

  const save = () => updateMutation.mutate({
    sensorCount: parseInt(String(form.sensorCount)) || 0,
    sensorModel: form.sensorModel || null,
    poeSwitchModel: form.poeSwitchModel || null,
    workScope: form.workScope,
  }, { onSuccess: () => setEditing(false) });

  const toggleScope = (s: string) => {
    setForm({
      ...form,
      workScope: form.workScope.includes(s)
        ? form.workScope.filter((x: string) => x !== s)
        : [...form.workScope, s],
    });
  };

  return (
    <EditableCard title="Equipment & Work Scope" icon="📷" editing={editing}
      onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}
      onSave={save} saving={updateMutation.isPending}>
      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Sensor model</label>
              <input value={form.sensorModel} onChange={(e) => setForm({ ...form, sensorModel: e.target.value })}
                placeholder="e.g. DITECH PC-3000"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Sensor count</label>
              <input type="number" min="0" value={form.sensorCount}
                onChange={(e) => setForm({ ...form, sensorCount: parseInt(e.target.value) || 0 })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">POE switch model</label>
              <input value={form.poeSwitchModel} onChange={(e) => setForm({ ...form, poeSwitchModel: e.target.value })}
                placeholder="e.g. Cisco SG350-10P"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-2">Work scope (toggle to enable)</label>
            <div className="flex flex-wrap gap-2">
              {WORK_SCOPES.map((s) => {
                const on = form.workScope.includes(s.value);
                return (
                  <button key={s.value} onClick={() => toggleScope(s.value)}
                    className={`text-xs px-3 py-1.5 rounded border transition ${
                      on ? s.color + ' font-medium' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                    }`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <Field label="Sensor model">{plan.sensorModel}</Field>
            <Field label="Sensor count">{plan.sensorCount || 0}</Field>
            <Field label="POE switch">{plan.poeSwitchModel}</Field>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Work scope</div>
            {(plan.workScope || []).length === 0 ? (
              <span className="text-gray-300 text-sm">— No scope set —</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {WORK_SCOPES.filter((s) => plan.workScope.includes(s.value)).map((s) => (
                  <span key={s.value} className={`text-xs px-2 py-1 rounded border ${s.color}`}>
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────
//   Card 6 — Description & Notes (full-width)
// ──────────────────────────────────────────────────────
function NotesCard({ plan, updateMutation }: any) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    description: plan.description || '',
    detail: plan.detail || '',
    trackingResult: plan.trackingResult || '',
  });
  useEffect(() => {
    if (!editing) setForm({
      description: plan.description || '', detail: plan.detail || '',
      trackingResult: plan.trackingResult || '',
    });
  }, [plan, editing]);

  const save = () => updateMutation.mutate({
    description: form.description || undefined,
    detail: form.detail || undefined,
    trackingResult: form.trackingResult || undefined,
  }, { onSuccess: () => setEditing(false) });

  return (
    <EditableCard title="Description & Notes" icon="📝" editing={editing}
      onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}
      onSave={save} saving={updateMutation.isPending}>
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Description *</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Detail / notes</label>
            <textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })}
              rows={3}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded resize-none" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">Tracking result</label>
            <textarea value={form.trackingResult} onChange={(e) => setForm({ ...form, trackingResult: e.target.value })}
              rows={3}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded resize-none" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Description">{plan.description}</Field>
          <Field label="Detail / notes">{plan.detail}</Field>
          <Field label="Tracking result">{plan.trackingResult}</Field>
        </div>
      )}
    </EditableCard>
  );
}
