import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cameraModelsApi, type CameraModel } from '../../api/cameraModels';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CameraModelsModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const modelsQuery = useQuery({
    queryKey: ['camera-models'],
    queryFn: () => cameraModelsApi.list({}),
    enabled: open,
  });

  const uploadImage = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => cameraModelsApi.uploadImage(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camera-models'] }),
  });

  const clearImage = useMutation({
    mutationFn: (id: string) => cameraModelsApi.clearImage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camera-models'] }),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-ditech-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base">📦 Camera Models Library</h3>
            <p className="text-xs text-ditech-text-muted">Upload an image per model — used across all designs.</p>
          </div>
          <button onClick={onClose} className="text-ditech-text-subtle hover:text-ditech-text text-lg">✕</button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {modelsQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-ditech-text-muted">Loading…</div>
          ) : (
            (modelsQuery.data ?? []).map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                onUpload={(file) => uploadImage.mutate({ id: m.id, file })}
                onClear={() => clearImage.mutate(m.id)}
                isUploading={uploadImage.isPending && uploadImage.variables?.id === m.id}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ditech-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs bg-ditech-primary text-white rounded hover:bg-ditech-primary-light">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface ModelCardProps {
  model: CameraModel;
  onUpload: (file: File) => void;
  onClear: () => void;
  isUploading: boolean;
}

function ModelCard({ model, onUpload, onClear, isUploading }: ModelCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-white border border-ditech-border rounded-lg p-3">
      <div className="flex items-center gap-3">
        {/* Image preview */}
        <div className="w-20 h-20 bg-slate-50 border border-slate-300 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
          {model.imageUrl ? (
            <img src={model.imageUrl} alt={model.displayName} className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-3xl">📷</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-ditech-text">{model.displayName}</div>
          <div className="text-[11px] text-ditech-text-muted">
            {model.minHeight}m – {model.maxHeight}m · {model.coverageTable.length} coverage rows
            {model.isSystem && <span className="ml-2 inline-block px-1.5 py-0 rounded bg-blue-50 text-blue-700 border border-blue-200">System</span>}
          </div>
          <div className="text-[11px] text-ditech-text-subtle mt-0.5">
            Functions: {model.supportedFunctions.join(', ')}
          </div>

          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="text-[11px] px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50"
            >
              {isUploading ? '⟳ Uploading...' : '📁 Upload Image'}
            </button>
            {model.imageUrl && (
              <button
                onClick={onClear}
                className="text-[11px] px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
              >
                ✕ Remove
              </button>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
        </div>

        {/* Color swatch */}
        {model.iconColor && (
          <div
            className="w-6 h-6 rounded-full border-2 border-white shadow"
            style={{ background: model.iconColor }}
            title={model.iconColor}
          />
        )}
      </div>
    </div>
  );
}
