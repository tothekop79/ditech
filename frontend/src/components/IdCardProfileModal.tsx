import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { useToast } from './Toast';

type Props = {
  user: any | null;
  isOpen: boolean;
  onClose: () => void;
};

// 77 provinces of Thailand (English names, alphabetical)
const THAI_PROVINCES = [
  'Amnat Charoen', 'Ang Thong', 'Bangkok', 'Bueng Kan', 'Buri Ram',
  'Chachoengsao', 'Chai Nat', 'Chaiyaphum', 'Chanthaburi', 'Chiang Mai',
  'Chiang Rai', 'Chonburi', 'Chumphon', 'Kalasin', 'Kamphaeng Phet',
  'Kanchanaburi', 'Khon Kaen', 'Krabi', 'Lampang', 'Lamphun',
  'Loei', 'Lopburi', 'Mae Hong Son', 'Maha Sarakham', 'Mukdahan',
  'Nakhon Nayok', 'Nakhon Pathom', 'Nakhon Phanom', 'Nakhon Ratchasima',
  'Nakhon Sawan', 'Nakhon Si Thammarat', 'Nan', 'Narathiwat',
  'Nong Bua Lamphu', 'Nong Khai', 'Nonthaburi', 'Pathum Thani',
  'Pattani', 'Phang Nga', 'Phatthalung', 'Phayao', 'Phetchabun',
  'Phetchaburi', 'Phichit', 'Phitsanulok', 'Phra Nakhon Si Ayutthaya',
  'Phrae', 'Phuket', 'Prachinburi', 'Prachuap Khiri Khan', 'Ranong',
  'Ratchaburi', 'Rayong', 'Roi Et', 'Sa Kaeo', 'Sakon Nakhon',
  'Samut Prakan', 'Samut Sakhon', 'Samut Songkhram', 'Saraburi', 'Satun',
  'Sing Buri', 'Sisaket', 'Songkhla', 'Sukhothai', 'Suphan Buri',
  'Surat Thani', 'Surin', 'Tak', 'Trang', 'Trat', 'Ubon Ratchathani',
  'Udon Thani', 'Uthai Thani', 'Uttaradit', 'Yala', 'Yasothon',
];

export function IdCardProfileModal({ user, isOpen, onClose }: Props) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: freshUser } = useQuery({
    queryKey: ['user-profile-full', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const list = await usersApi.list();
      return list.find((u: any) => u.id === user.id) || user;
    },
    enabled: isOpen && !!user?.id,
  });

  const [form, setForm] = useState({
    fullName: '',
    idCard: '',
    position: '',
    phoneForDoc: '',
    province: '',
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    const u = freshUser || user;
    if (u) {
      setForm({
        fullName: u.fullName ?? '',
        idCard: u.idCard ?? '',
        position: u.position ?? '',
        phoneForDoc: u.phoneForDoc ?? u.phone ?? '',
        province: u.province ?? '',
      });
      setPhotoPreview(u.idCardPhotoUrl || null);
    }
  }, [freshUser, user]);

  const saveMut = useMutation({
    mutationFn: () => usersApi.patchProfile(user.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['user-profile-full', user.id] });
      showToast('Profile saved');
      onClose();
    },
    onError: (e: any) => {
      showToast(e?.response?.data?.message || 'Save failed');
    },
  });

  const photoMut = useMutation({
    mutationFn: (file: File) => usersApi.uploadIdCardPhoto(user.id, file),
    onSuccess: (data: any) => {
      setPhotoPreview(data.idCardPhotoUrl || null);
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user-profile-full', user.id] });
      showToast('Photo uploaded');
    },
    onError: () => showToast('Upload failed'),
  });

  if (!isOpen || !user) return null;

  const apiBase = (import.meta as any).env?.VITE_API_BASE || '';
  const photoSrc = photoPreview
    ? (photoPreview.startsWith('http') ? photoPreview : apiBase.replace(/\/api$/, '') + photoPreview)
    : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="text-base font-semibold">Staff Profile — {user.fullName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Used in Work Permit documents and other generated paperwork.
          </p>

          <div>
            <label className="text-sm text-gray-700 block mb-1">Full name</label>
            <input type="text" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-700 block mb-1">National ID (13 digits)</label>
              <input type="text" value={form.idCard} onChange={(e) => setForm({ ...form, idCard: e.target.value })}
                placeholder="3 4710 00045 21 9"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono" />
            </div>
            <div>
              <label className="text-sm text-gray-700 block mb-1">Phone (for documents)</label>
              <input type="text" value={form.phoneForDoc} onChange={(e) => setForm({ ...form, phoneForDoc: e.target.value })}
                placeholder="086-707-8017"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-700 block mb-1">Position</label>
              <input type="text" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="Technician / Project Manager"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-700 block mb-1">Province</label>
              <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white">
                <option value="">— Select province —</option>
                {THAI_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-700 block mb-1">ID card photo</label>
            <div className="flex items-center gap-3">
              <div className="w-32 h-32 border border-gray-300 rounded bg-gray-50 flex items-center justify-center overflow-hidden">
                {photoSrc ? (
                  <img src={photoSrc} alt="ID card" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-gray-400">No photo</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => fileRef.current?.click()}
                  disabled={photoMut.isPending}
                  className="px-3 py-1.5 text-sm border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-40">
                  {photoMut.isPending ? 'Uploading…' : 'Upload photo'}
                </button>
                <span className="text-[10px] text-gray-400">JPG/PNG up to 10MB</span>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) photoMut.mutate(f);
                  e.target.value = '';
                }} />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2 bg-gray-50">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
            {saveMut.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
