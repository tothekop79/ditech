import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '../../api/events';
import { useToast } from '../Toast';

export function RawdataUploader({ eventId }: { eventId: string }) {
  const showToast = useToast((s) => s.show);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['event-rawdata-status', eventId],
    queryFn: () => eventsApi.rawdataStatus(eventId),
  });

  const upload = useMutation({
    mutationFn: (file: File) => eventsApi.uploadRawdata(eventId, file, setProgress),
    onSuccess: (data) => {
      showToast(`✅ Uploaded ${data.filename}`);
      setProgress(0);
      qc.invalidateQueries({ queryKey: ['event-rawdata-status', eventId] });
      qc.invalidateQueries({ queryKey: ['event', eventId] });
    },
    onError: (e: any) => {
      setProgress(0);
      showToast(e?.response?.data?.message || 'Upload failed');
    },
  });

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      showToast('Only .xlsx files are accepted');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast('File exceeds 50 MB limit');
      return;
    }
    upload.mutate(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          drag ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}>
        {upload.isPending ? (
          <div>
            <div className="text-sm text-blue-700 mb-2">Uploading… {progress}%</div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : status?.uploaded ? (
          <div>
            <div className="text-3xl mb-2">📊</div>
            <div className="text-sm text-green-700 font-semibold">Rawdata.xlsx uploaded</div>
            <div className="text-xs text-gray-500 mt-1">Click to replace, or drag a new file here</div>
          </div>
        ) : (
          <div>
            <div className="text-3xl mb-2">📤</div>
            <div className="text-sm font-semibold text-gray-900">Upload Rawdata.xlsx</div>
            <div className="text-xs text-gray-500 mt-1">
              Drag and drop, or click to browse · Up to 50 MB
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
