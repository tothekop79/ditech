import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { useToast } from '../components/Toast';
import { IdCardProfileModal } from '../components/IdCardProfileModal';
import AddUserModal from '../components/AddUserModal';

const apiBase = (import.meta as any).env?.VITE_API_BASE || '';
const photoUrl = (path?: string | null) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return apiBase.replace(/\/api$/, '') + path;
};

export function UsersPage() {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [showCreate, setShowCreate] = useState(false);
  const [profileUser, setProfileUser] = useState<any>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: any) => usersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      showToast('Updated');
    },
  });

  const toggleActive = (u: any) => update.mutate({ id: u.id, data: { isActive: !u.isActive } });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Users · {users?.length || 0}</h2>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-ditech-primary text-white rounded text-sm hover:bg-blue-800">
          + Add user
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-2 py-2 text-left w-12">Photo</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Province</th>
                <th className="px-3 py-2 text-left">Position</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u: any) => {
                const photo = photoUrl(u.idCardPhotoUrl);
                return (
                  <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-1.5">
                      <div className="w-8 h-8 rounded border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                        {photo ? (
                          <img src={photo} alt={u.fullName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium">{u.fullName}</td>
                    <td className="px-3 py-2 text-gray-600">{u.email}</td>
                    <td className="px-3 py-2 text-gray-600">{u.phoneForDoc || u.phone || '—'}</td>
                    <td className="px-3 py-2">
                      <RoleSelect user={u} />
                    </td>
                    <td className="px-3 py-2 text-gray-700">{u.province || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-gray-700">{u.position || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${u.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.isActive ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setProfileUser(u)}
                        className="text-xs text-blue-600 hover:underline mr-3">
                        edit profile
                      </button>
                      <button onClick={() => toggleActive(u)}
                        className="text-xs text-gray-500 hover:text-gray-800">
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddUserModal open={showCreate} onClose={() => setShowCreate(false)} />
      <IdCardProfileModal user={profileUser} isOpen={!!profileUser} onClose={() => setProfileUser(null)} />
    </div>
  );
}

function RoleSelect({ user }: { user: any }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const m = useMutation({
    mutationFn: (role: string) => usersApi.update(user.id, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      showToast('Role updated');
    },
  });
  return (
    <select defaultValue={user.role} onChange={(e) => m.mutate(e.target.value)}
      className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white">
      <option value="ADMIN">ADMIN</option>
      <option value="PROJECT_MANAGER">PROJECT_MANAGER</option>
      <option value="INSTALLER">INSTALLER</option>
      <option value="QA">QA</option>
      <option value="CUSTOMER">CUSTOMER</option>
    </select>
  );
}

