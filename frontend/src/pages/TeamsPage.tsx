import { useState } from 'react';
import { IdCardProfileModal } from '../components/IdCardProfileModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '../api/teams';
import { usersApi } from '../api/users';
import { useToast } from '../components/Toast';

export function TeamsPage() {
  const [profileUser, setProfileUser] = useState<any>(null);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);

  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.list });
  const { data: allUsers } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => usersApi.list(),
  });

  const installers = (allUsers || []).filter((u: any) => u.role === 'INSTALLER' || u.role === 'PROJECT_MANAGER');

  const updateChatId = useMutation({
    mutationFn: ({ teamId, chatId }: any) => teamsApi.updateChatId(teamId, chatId || null),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); showToast('Chat ID updated'); },
  });
  const addMember = useMutation({
    mutationFn: ({ teamId, userId }: any) => teamsApi.addMember(teamId, userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); showToast('Member added'); },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed'),
  });
  const removeMember = useMutation({
    mutationFn: ({ teamId, userId }: any) => teamsApi.removeMember(teamId, userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); showToast('Member removed'); },
  });
  const setLead = useMutation({
    mutationFn: ({ teamId, userId }: any) => teamsApi.setLead(teamId, userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); showToast('Team lead updated'); },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed'),
  });
  const deleteTeam = useMutation({
    mutationFn: (teamId: string) => teamsApi.delete(teamId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); showToast('Team deleted'); },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Teams · {teams?.length || 0}</h2>
        <button onClick={() => setShowAddTeam(true)}
          className="px-4 py-2 bg-ditech-primary text-white rounded text-sm hover:bg-blue-800">
          + Add team
        </button>
      </div>

      {!teams ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((t: any) => (
            <div key={t.id} className="border border-gray-200 rounded p-4 bg-white">
              <div className="flex items-start justify-between mb-3 pb-2 border-b border-gray-100">
                <div>
                  <h3 className="font-medium text-base">{t.name}</h3>
                  <p className="text-xs text-gray-500">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 mr-2">{t.region}</span>
                    {t._count?.members ?? 0} members · {t._count?.assignedPlans ?? 0} plans
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setEditingTeam(t)}
                    className="text-xs text-blue-600 hover:underline">✏ rename</button>
                  <button onClick={() => {
                    if (confirm(`Delete team "${t.name}"? This cannot be undone.`)) {
                      deleteTeam.mutate(t.id);
                    }
                  }}
                    className="text-xs text-red-600 hover:underline">🗑 delete</button>
                </div>
              </div>

              <div className="mb-3">
                <span className="text-xs font-medium text-gray-600 block mb-1">Telegram chat ID</span>
                <ChatIdEditor team={t} onSave={(chatId) => updateChatId.mutate({ teamId: t.id, chatId })} />
              </div>

              <div className="mb-3">
                <span className="text-xs font-medium text-gray-600 block mb-1">Members</span>
                {(!t.members || t.members.length === 0) && <p className="text-xs text-gray-400">No members</p>}
                {t.members?.map((m: any) => {
                  const isLead = t.leadUserId === m.user.id;
                  return (
                    <div key={m.user.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-b-0">
                      <span className="flex items-center gap-1.5">
                        {isLead && <span title="Team Lead" className="text-yellow-500">⭐</span>}
                        <span className={isLead ? 'font-medium' : ''}>{m.user.fullName}</span>
                        <span className="text-[10px] text-gray-400">({m.user.role})</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <button onClick={() => setProfileUser(m.user)}
                          className="text-[11px] text-blue-600 hover:underline">edit profile</button>
                        {!isLead ? (
                          <button onClick={() => setLead.mutate({ teamId: t.id, userId: m.user.id })}
                            title="Promote to team lead"
                            className="text-[11px] text-yellow-600 hover:underline">make lead</button>
                        ) : (
                          <button onClick={() => setLead.mutate({ teamId: t.id, userId: null })}
                            title="Demote to member"
                            className="text-[11px] text-gray-500 hover:underline">demote</button>
                        )}
                        <button onClick={() => removeMember.mutate({ teamId: t.id, userId: m.user.id })}
                          className="text-[11px] text-red-600 hover:underline">remove</button>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div>
                <span className="text-xs font-medium text-gray-600 block mb-1">Add member</span>
                <select onChange={(e) => {
                  if (e.target.value) {
                    addMember.mutate({ teamId: t.id, userId: e.target.value });
                    e.target.value = '';
                  }
                }} className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white">
                  <option value="">— Pick installer / PM to add —</option>
                  {installers.filter((u: any) =>
                    !t.members?.some((m: any) => m.user.id === u.id)
                  ).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddTeam && <AddTeamModal onClose={() => setShowAddTeam(false)} />}
      {editingTeam && <EditTeamModal team={editingTeam} onClose={() => setEditingTeam(null)} />}
      <IdCardProfileModal user={profileUser} isOpen={!!profileUser} onClose={() => setProfileUser(null)} />
    </div>
  );
}

function ChatIdEditor({ team, onSave }: { team: any; onSave: (chatId: string) => void }) {
  const [val, setVal] = useState(team.telegramChatId || '');
  const dirty = val !== (team.telegramChatId || '');
  return (
    <div className="flex gap-2">
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="-1001234567890"
        className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm font-mono" />
      <button disabled={!dirty} onClick={() => onSave(val)}
        className="px-3 py-1.5 text-xs border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50">
        Save
      </button>
    </div>
  );
}

function AddTeamModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [form, setForm] = useState({ name: '', region: 'BANGKOK' as 'BANGKOK' | 'UPC', telegramChatId: '' });
  const m = useMutation({
    mutationFn: () => teamsApi.create({
      name: form.name, region: form.region,
      telegramChatId: form.telegramChatId || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); showToast('Team created'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-medium">Add team</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Team name *</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Team E"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Region</span>
            <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white">
              <option value="BANGKOK">BANGKOK</option>
              <option value="UPC">UPC (Up-country)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Telegram chat ID (optional)</span>
            <input value={form.telegramChatId} onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
              placeholder="-1001234567890"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono" />
          </label>
        </div>
        <div className="px-6 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-white">Cancel</button>
          <button onClick={() => m.mutate()} disabled={m.isPending || !form.name}
            className="px-4 py-2 bg-ditech-primary text-white rounded text-sm hover:bg-blue-800 disabled:opacity-50">
            {m.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTeamModal({ team, onClose }: { team: any; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [form, setForm] = useState({
    name: team.name,
    region: team.region as 'BANGKOK' | 'UPC',
  });
  const m = useMutation({
    mutationFn: () => teamsApi.update(team.id, { name: form.name, region: form.region }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); showToast('Team updated'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-medium">Edit team</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Team name *</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 block mb-1">Region</span>
            <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white">
              <option value="BANGKOK">BANGKOK</option>
              <option value="UPC">UPC (Up-country)</option>
            </select>
          </label>
        </div>
        <div className="px-6 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-white">Cancel</button>
          <button onClick={() => m.mutate()} disabled={m.isPending || !form.name}
            className="px-4 py-2 bg-ditech-primary text-white rounded text-sm hover:bg-blue-800 disabled:opacity-50">
            {m.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
