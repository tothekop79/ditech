import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';

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

const ROLES = ['ADMIN','PROJECT_MANAGER','INSTALLER','QA','CUSTOMER'];

export default function AddUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '',
    role: 'INSTALLER', idCard: '', position: '', province: '', phoneForDoc: '',
    idCardPhotoUrl: '',
  });
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [error, setError] = useState<string>('');

  const m = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
      setForm({
        fullName: '', email: '', phone: '', password: '',
        role: 'INSTALLER', idCard: '', position: '', province: '', phoneForDoc: '',
        idCardPhotoUrl: '',
      });
      setPhotoPreview('');
      setError('');
    },
    onError: (e: any) => setError(e?.response?.data?.message || e?.message || 'Failed to create user'),
  });

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotoPreview(dataUrl);
      setForm(f => ({ ...f, idCardPhotoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    setError('');
    if (!form.fullName || !form.email || !form.password) {
      setError('Full name, email, password are required');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be 6+ characters');
      return;
    }
    m.mutate({
      fullName: form.fullName, email: form.email, phone: form.phone || undefined,
      password: form.password, role: form.role,
      idCard: form.idCard || null, position: form.position || null,
      province: form.province || null, phoneForDoc: form.phoneForDoc || null,
      idCardPhotoUrl: form.idCardPhotoUrl || null,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium">Add user</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        <div className="p-6 space-y-4">
          {/* Photo */}
          <div>
            <label className="block text-sm font-medium mb-2">ID card photo (optional)</label>
            <div className="flex items-start gap-4">
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-24 h-24 object-cover rounded border" />
              ) : (
                <div className="w-24 h-24 bg-gray-100 rounded border flex items-center justify-center text-gray-400 text-xs">No photo</div>
              )}
              <div className="flex-1">
                <input type="file" accept="image/*" onChange={onPhoto}
                  className="block text-sm text-gray-600
                    file:mr-3 file:py-1.5 file:px-3 file:border file:border-gray-300
                    file:rounded file:bg-white file:text-sm file:cursor-pointer hover:file:bg-gray-50" />
                <p className="text-[11px] text-gray-500 mt-1">JPG/PNG, stored as base64</p>
              </div>
            </div>
          </div>

          {/* Required fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Full name *</label>
              <input value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Initial password *</label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role *</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm bg-white">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone for documents</label>
              <input value={form.phoneForDoc} onChange={e => setForm({...form, phoneForDoc: e.target.value})}
                placeholder="Optional, defaults to phone"
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">National ID</label>
              <input value={form.idCard} onChange={e => setForm({...form, idCard: e.target.value})}
                placeholder="13 digits" maxLength={13}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Position</label>
              <input value={form.position} onChange={e => setForm({...form, position: e.target.value})}
                placeholder="e.g. Senior Installer"
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Province</label>
              <select value={form.province} onChange={e => setForm({...form, province: e.target.value})}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm bg-white">
                <option value="">— Select province —</option>
                {PROVINCES_EN.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} disabled={m.isPending}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100">
            Cancel
          </button>
          <button onClick={submit} disabled={m.isPending}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60">
            {m.isPending ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  );
}
