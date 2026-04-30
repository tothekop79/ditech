import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { photosApi, photoUrl } from '../api/photos';
import { useToast } from './Toast';

const CATEGORIES = ['BEFORE', 'DURING', 'AFTER', 'EQUIPMENT', 'ISSUE', 'HANDOVER', 'OTHER'];

const CATEGORY_LABEL: Record<string, string> = {
  BEFORE: 'ก่อนติดตั้ง',
  DURING: 'ระหว่างติดตั้ง',
  AFTER: 'หลังติดตั้ง',
  EQUIPMENT: 'อุปกรณ์',
  ISSUE: 'ปัญหา',
  HANDOVER: 'ส่งมอบ',
  OTHER: 'อื่น ๆ',
};

const CATEGORY_COLORS: Record<string, string> = {
  BEFORE: 'bg-blue-50 text-blue-700',
  DURING: 'bg-amber-50 text-amber-700',
  AFTER: 'bg-green-50 text-green-700',
  EQUIPMENT: 'bg-purple-50 text-purple-700',
  ISSUE: 'bg-red-50 text-red-700',
  HANDOVER: 'bg-indigo-50 text-indigo-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

export function PhotosSection({ planId }: { planId: string }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [uploadCategory, setUploadCategory] = useState('BEFORE');
  const [filterCategory, setFilterCategory] = useState('');
  const [previewing, setPreviewing] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const dragCountRef = useRef(0);

  const { data: photos, isLoading } = useQuery({
    queryKey: ['photos', planId],
    queryFn: () => photosApi.list(planId),
  });

  const upload = useMutation({
    mutationFn: ({ file, category }: { file: File; category: string }) =>
      photosApi.upload(planId, file, category),
    onSuccess: () => {
      showToast('Photo uploaded');
      qc.invalidateQueries({ queryKey: ['photos', planId] });
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Upload failed'),
  });

  const del = useMutation({
    mutationFn: (id: string) => photosApi.delete(id),
    onSuccess: () => {
      showToast('Photo deleted');
      qc.invalidateQueries({ queryKey: ['photos', planId] });
    },
  });

  const updateCaption = useMutation({
    mutationFn: ({ id, caption, category }: any) => photosApi.update(id, { caption, category }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos', planId] }),
  });

  // Use a ref so the paste handler always has the latest category (avoids stale closure)
  const uploadCategoryRef = useRef(uploadCategory);
  useEffect(() => { uploadCategoryRef.current = uploadCategory; }, [uploadCategory]);

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files as any) as File[];
    arr.forEach((file) => {
      if (file.type.startsWith('image/')) {
        upload.mutate({ file, category: uploadCategoryRef.current });
      } else {
        showToast(`Skipped: ${file.name} (not an image)`);
      }
    });
  };

  // ── Clipboard paste — listens on whole document ──────────────────────────
  // Only acts if focus is in this plan's page (not e.g. a real input field)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // Skip if user is pasting into a regular text input/textarea
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        // Only block if it's a text input that already has content
        const isTextField = target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'file';
        if (isTextField || target.tagName === 'TEXTAREA') return;
      }

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            // Clipboard images often arrive as 'image.png' with no real name — give it a timestamp
            const ext = file.type.split('/')[1] || 'png';
            const named = file.name && file.name !== 'image.png'
              ? file
              : new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
            imageFiles.push(named);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        showToast(`Pasted ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''}`);
        handleFiles(imageFiles);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drag-drop handlers — using counter to handle nested dragenter/leave ──
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCountRef.current++;
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDragging(false);
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const filtered = filterCategory
    ? (photos || []).filter((p: any) => p.category === filterCategory)
    : (photos || []);

  const counts: Record<string, number> = {};
  (photos || []).forEach((p: any) => { counts[p.category] = (counts[p.category] || 0) + 1; });

  return (
    <div
      ref={sectionRef}
      className="bg-white border border-gray-200 rounded p-4 relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drag-over overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-blue-500/10 border-4 border-dashed border-blue-500 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="bg-white px-4 py-2 rounded shadow-lg text-sm text-blue-700 font-medium">
            ⬇️ Drop image{`${' '}`}to upload as <strong>{CATEGORY_LABEL[uploadCategory]}</strong>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 pb-2 border-b flex-wrap gap-2">
        <h3 className="text-sm font-medium text-gray-700">
          Photos {photos ? `(${photos.length})` : ''}
          <span className="text-xs text-gray-400 font-normal ml-2 hidden sm:inline">
            · Paste (Ctrl+V) or drag &amp; drop also works
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-300 rounded">
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          <input type="file" ref={fileRef} multiple accept="image/*" hidden
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="px-3 py-1 text-xs bg-ditech-primary text-white rounded hover:bg-blue-800 disabled:opacity-50">
            {upload.isPending ? 'Uploading...' : '📷 Upload'}
          </button>
        </div>
      </div>

      {/* Category filter chips */}
      {(photos || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <button onClick={() => setFilterCategory('')}
            className={`text-xs px-2 py-0.5 rounded border ${
              !filterCategory ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600'
            }`}>
            All ({photos!.length})
          </button>
          {CATEGORIES.filter(c => counts[c] > 0).map(c => (
            <button key={c} onClick={() => setFilterCategory(c === filterCategory ? '' : c)}
              className={`text-xs px-2 py-0.5 rounded border ${
                filterCategory === c ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300'
              } ${filterCategory !== c ? CATEGORY_COLORS[c] : ''}`}>
              {CATEGORY_LABEL[c]} ({counts[c]})
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="py-6 text-center text-gray-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded">
          {(photos || []).length === 0 ?
            <>📷 No photos yet.<br /><span className="text-xs">Click Upload, paste from clipboard, or drag &amp; drop images here.</span></> :
            'No photos in this category.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p: any) => (
            <div key={p.id} className="border border-gray-200 rounded overflow-hidden group relative">
              <div className="aspect-square bg-gray-100 cursor-pointer"
                onClick={() => setPreviewing(p)}>
                <img src={photoUrl(p.storagePath)} alt={p.caption || p.filename}
                  className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="p-2">
                <select defaultValue={p.category}
                  onChange={(e) => updateCaption.mutate({ id: p.id, caption: p.caption, category: e.target.value })}
                  className={`text-xs px-1.5 py-0.5 rounded border-0 ${CATEGORY_COLORS[p.category]} cursor-pointer`}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                </select>
                <input
                  defaultValue={p.caption || ''}
                  placeholder="Caption..."
                  onBlur={(e) => {
                    if (e.target.value !== (p.caption || '')) {
                      updateCaption.mutate({ id: p.id, caption: e.target.value });
                    }
                  }}
                  className="w-full mt-1 px-1 py-0.5 text-xs border border-gray-100 rounded focus:border-gray-300"
                />
                <div className="text-[10px] text-gray-400 mt-1 truncate">
                  {new Date(p.createdAt).toLocaleDateString('en-GB')}
                  {p.uploadedBy && ` · ${p.uploadedBy.fullName}`}
                </div>
              </div>
              <button onClick={() => { if (confirm('Delete this photo?')) del.mutate(p.id); }}
                className="absolute top-1 right-1 bg-red-600 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewing(null)}>
          <img src={photoUrl(previewing.storagePath)} alt={previewing.caption || ''}
            className="max-w-full max-h-full object-contain" />
          <button onClick={() => setPreviewing(null)}
            className="absolute top-4 right-4 text-white text-3xl leading-none">×</button>
          {previewing.caption && (
            <div className="absolute bottom-4 left-4 right-4 text-white text-center bg-black/60 p-2 rounded">
              {previewing.caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
