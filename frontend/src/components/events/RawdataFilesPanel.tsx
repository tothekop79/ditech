import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useToast } from '../Toast';

interface SourceFile {
  filename: string;
  size: number;
  uploadedAt: string;
  date: string | null;
  rowCount?: number;
}

interface Props {
  eventId: string;
  configuredDates?: string[];   // YYYY-MM-DD list from event days
}

export function RawdataFilesPanel({ eventId, configuredDates = [] }: Props) {
  const showToast = useToast((s) => s.show);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<'append' | 'replace'>('append');

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['event-rawdata-files', eventId],
    queryFn: () =>
      api
        .get<{ success: boolean; data: SourceFile[] }>(`/events/${eventId}/rawdata-files`)
        .then((r) => r.data.data),
  });

  const uploadMutation = useMutation({
    mutationFn: async (selectedFiles: File[]) => {
      // If replace mode, clear first
      if (mode === 'replace' && files.length > 0) {
        await api.post(`/events/${eventId}/rawdata-files/clear`);
      }
      const fd = new FormData();
      selectedFiles.forEach((f) => fd.append('files', f));
      return api
        .post(`/events/${eventId}/rawdata-files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) setProgress(Math.round((e.loaded * 100) / e.total));
          },
        })
        .then((r) => r.data.data as SourceFile[]);
    },
    onSuccess: (saved) => {
      showToast(`✅ Uploaded ${saved.length} file${saved.length !== 1 ? 's' : ''}`);
      setProgress(0);
      qc.invalidateQueries({ queryKey: ['event-rawdata-files', eventId] });
      qc.invalidateQueries({ queryKey: ['event-rawdata-status', eventId] });
    },
    onError: (e: any) => {
      setProgress(0);
      showToast(e?.response?.data?.message || 'Upload failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) =>
      api.delete(`/events/${eventId}/rawdata-files/${encodeURIComponent(filename)}`),
    onSuccess: () => {
      showToast('File deleted');
      qc.invalidateQueries({ queryKey: ['event-rawdata-files', eventId] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Delete failed'),
  });

  const clearAllMutation = useMutation({
    mutationFn: () => api.post(`/events/${eventId}/rawdata-files/clear`),
    onSuccess: () => {
      showToast('All files cleared');
      qc.invalidateQueries({ queryKey: ['event-rawdata-files', eventId] });
    },
  });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const list = Array.from(e.dataTransfer.files).filter((f) => /\.(xlsx|xlsm)$/i.test(f.name));
    if (list.length === 0) {
      showToast('Only .xlsx files are accepted');
      return;
    }
    uploadMutation.mutate(list);
  };

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    if (list.length === 0) return;
    uploadMutation.mutate(list);
    if (inputRef.current) inputRef.current.value = '';
  };

  // Match configured dates to files
  const fileByDate = new Map<string, SourceFile>();
  for (const f of files) {
    if (f.date) fileByDate.set(f.date, f);
  }

  const matchedDates = configuredDates.filter((d) => fileByDate.has(d));
  const unmatchedFiles = files.filter((f) => !f.date || !configuredDates.includes(f.date));
  const missingDates = configuredDates.filter((d) => !fileByDate.has(d));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">📤 Rawdata files</h3>
        <div className="text-xs text-gray-500">
          {files.length} file{files.length !== 1 ? 's' : ''}
          {files.length > 0 && (
            <button onClick={() => {
              if (confirm(`Remove all ${files.length} files?`)) clearAllMutation.mutate();
            }}
              className="ml-2 text-red-600 hover:underline">Clear all</button>
          )}
        </div>
      </div>

      {/* Upload mode toggle */}
      {files.length > 0 && (
        <div className="flex items-center gap-3 text-xs bg-gray-50 px-3 py-1.5 rounded">
          <span className="text-gray-500">When uploading:</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} />
            <span>Append</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>Replace all</span>
          </label>
        </div>
      )}

      {/* Drop zone */}
      <input ref={inputRef} type="file" multiple accept=".xlsx,.xlsm" className="hidden" onChange={onSelect} />
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition ${
          drag ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}>
        {uploadMutation.isPending ? (
          <div>
            <div className="text-sm text-blue-700 mb-2">Uploading… {progress}%</div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div>
            <div className="text-2xl mb-1">📤</div>
            <div className="text-sm font-semibold text-gray-900">
              Drop CaptureRecordsDetails files here
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              .xlsx · 1 file per day · up to 30 files · 50 MB each
            </div>
          </div>
        )}
      </div>

      {/* File list */}
      {isLoading ? (
        <div className="py-4 text-center text-xs text-gray-400">Loading…</div>
      ) : files.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Uploaded</div>
          {files.map((f) => {
            const isMatch = f.date && configuredDates.includes(f.date);
            const isUnmatchedDate = f.date && !configuredDates.includes(f.date);
            const noDate = !f.date;
            return (
              <div key={f.filename}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs border ${
                  isMatch ? 'bg-green-50 border-green-200' :
                  isUnmatchedDate ? 'bg-amber-50 border-amber-200' :
                  noDate ? 'bg-red-50 border-red-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                <span className="text-base">
                  {isMatch ? '✅' : isUnmatchedDate ? '⚠' : noDate ? '❌' : '📄'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{f.filename}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {f.date ? <span className="font-mono">{f.date}</span> : <span className="text-red-600">no date in name</span>}
                    <span className="mx-1">·</span>
                    <span>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
                <button onClick={() => {
                  if (confirm(`Delete ${f.filename}?`)) deleteMutation.mutate(f.filename);
                }}
                  className="text-gray-400 hover:text-red-600 px-1 text-sm" title="Delete">🗑</button>
              </div>
            );
          })}

          {/* Missing days warning */}
          {missingDates.length > 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
              ⚠ Missing files for: {missingDates.join(', ')}
            </div>
          )}
          {/* Unmatched files info */}
          {unmatchedFiles.length > 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              ⚠ {unmatchedFiles.length} file(s) don't match any configured day
            </div>
          )}
          {matchedDates.length > 0 && matchedDates.length === configuredDates.length && unmatchedFiles.length === 0 && (
            <div className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
              ✅ All configured days have a matching file
            </div>
          )}
        </div>
      ) : (
        <div className="py-3 text-center text-xs text-gray-400 italic">
          No files uploaded yet
        </div>
      )}

      {/* Hint */}
      <div className="text-[10px] text-gray-400 italic">
        💡 Files are merged into Rawdata.xlsx automatically when you generate a report.
        Date is extracted from filenames containing YYYYMMDD or YYYY-MM-DD.
      </div>
    </div>
  );
}
