import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plansApi } from '../api/plans';
import { useToast } from '../components/Toast';

export function ImportPage() {
  const [preview, setPreview] = useState<any[] | null>(null);
  const [importMode, setImportMode] = useState<'create' | 'upsert'>('upsert');
  const [filename, setFilename] = useState('');
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const validate = useMutation({
    mutationFn: ({ rows, mode }: any) => plansApi.validateImport(rows, mode),
    onSuccess: (data) => setPreview(data),
    onError: (err: any) => showToast(err.response?.data?.message || 'Validation failed'),
  });

  const importMut = useMutation({
    mutationFn: ({ rows, mode }: any) => plansApi.bulkImport(rows, mode),
    onSuccess: (res) => {
      showToast(`Created ${res.created || 0}, updated ${res.updated || 0}`);
      qc.invalidateQueries({ queryKey: ['plans'] });
      setPreview(null); setFilename('');
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Import failed'),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    onDrop: async (files) => {
      const file = files[0]; if (!file) return;
      setFilename(file.name);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const normalized = rows.map(normalizeRow).filter(r => Object.keys(r).length > 0);
      validate.mutate({ rows: normalized, mode: importMode });
    },
  });

  const loadSample = () => {
    const sample = [
      { customerCode: 'XIAOMI', departmentCode: 'CENTRAL', storeName: 'Central Bangrak', description: 'install Cam', sensorCount: 2, storeRegion: 'BANGKOK', readiness: 'READY', detail: 'Confirm', scheduledDate: '2026-05-15' },
      { customerCode: 'OPPO', departmentCode: 'LOTUS', storeName: 'Lotus Korat', description: 'install Cam + Lan', sensorCount: 1, storeRegion: 'UPC', readiness: 'NOT_READY', detail: 'รอติดต่อสาขา', scheduledDate: '2026-05-20' },
      { customerCode: 'INVALID', departmentCode: 'CENTRAL', storeName: 'Bad Row', description: 'test', sensorCount: 1, readiness: 'READY' },
      { customerCode: 'XIAOMI', departmentCode: 'BIG_C', storeName: 'BIG C Pattaya', description: 'install Cam', sensorCount: 3, storeRegion: 'UPC', readiness: 'PENDING', scheduledDate: '2026-05-22' },
    ];
    setFilename('sample.xlsx');
    validate.mutate({ rows: sample, mode: importMode });
  };

  const valid = preview?.filter(r => r.status === 'ok') || [];
  const errors = preview?.filter(r => r.status === 'error') || [];
  const warns = preview?.filter(r => r.status === 'warn') || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-medium">Import plans</h2>
            <p className="text-[11px] text-gray-500">Upload .xlsx / .csv. Use buttons → for template or backup.</p>
          </div>
          <div className="flex gap-2">
            <TemplateBtn />
            <ExportBtn />
          </div>
        </div>
        <div className="mb-4 flex items-center gap-4 text-sm flex-wrap">
          <span className="font-medium">Import mode:</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="importMode" checked={importMode === 'upsert'}
              onChange={() => setImportMode('upsert')} />
            <span>🔄 Upsert <span className="text-[10px] text-gray-500">(update existing + create new)</span></span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="importMode" checked={importMode === 'create'}
              onChange={() => setImportMode('create')} />
            <span>🆕 Create only</span>
          </label>
        </div>
        <p className="text-xs text-gray-500 mb-3">Drag .xlsx / .csv. Upsert match key: <code className="bg-gray-100 px-1 rounded">customerCode + departmentCode + storeName</code></p>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50 hover:bg-blue-50 hover:border-blue-400'
          }`}
        >
          <input {...getInputProps()} />
          <div className="text-3xl text-gray-400 mb-2">⬆</div>
          <div className="font-medium">Drop .xlsx, .xls, or .csv here</div>
          <div className="text-xs text-gray-500 mt-1">or click to browse</div>
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded">
          <h4 className="font-medium text-sm mb-1">Expected columns</h4>
          <p className="text-xs text-gray-600 leading-6">
            customerCode · departmentCode · storeName · description · sensorCount · storeRegion · readiness · detail · scheduledDate
          </p>
          <button onClick={loadSample} className="text-xs px-3 py-1.5 mt-2 border border-gray-300 rounded hover:bg-white">
            Load sample data
          </button>
        </div>
      </div>

      <div>
        {preview ? (
          <div>
            <h3 className="text-base font-medium mb-2">Preview · {filename}</h3>
            <div className="flex gap-3 mb-3 text-sm flex-wrap">
              <span className="text-green-600">✓ {valid.length} valid</span>
              {importMode === 'upsert' && (
                <>
                  <span className="text-blue-600">🆕 {valid.filter((r: any) => r.action !== 'update').length} new</span>
                  <span className="text-purple-600">🔄 {valid.filter((r: any) => r.action === 'update').length} update</span>
                </>
              )}
              {warns.length > 0 && <span className="text-amber-600">⚠ {warns.length} warnings</span>}
              {errors.length > 0 && <span className="text-red-600">✗ {errors.length} errors</span>}
            </div>
            <div className="border border-gray-200 rounded max-h-[400px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left">Action</th>
                    <th className="px-2 py-1 text-left">Customer</th>
                    <th className="px-2 py-1 text-left">Dept</th>
                    <th className="px-2 py-1 text-left">Store</th>
                    <th className="px-2 py-1 text-left">Status</th>
                    <th className="px-2 py-1 text-left">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => {
                    const cls = r.status === 'error' ? 'bg-red-50' : r.status === 'warn' ? 'bg-amber-50' : '';
                    return (
                      <tr key={i} className={cls + ' border-t border-gray-100'}>
                        <td className="px-2 py-1">{r.row}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {importMode === 'upsert' && ((r as any).action === 'update' ? '🔄' : '🆕')}
                        </td>
                        <td className="px-2 py-1">{r.data.customerCode || '—'}</td>
                        <td className="px-2 py-1">{r.data.departmentCode || '—'}</td>
                        <td className="px-2 py-1">{r.data.storeName || '—'}</td>
                        <td className="px-2 py-1">{r.status}</td>
                        <td className="px-2 py-1 text-[10px]">{r.message}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => importMut.mutate({ rows: preview!.filter(r => r.status !== 'error').map(r => r.data), mode: importMode })}
                disabled={valid.length === 0 || importMut.isPending}
                className="px-4 py-2 bg-ditech-primary text-white rounded text-sm hover:bg-blue-800 disabled:opacity-50"
              >
                {importMut.isPending ? 'Importing...' : `Import ${valid.length} valid rows`}
              </button>
              <button onClick={() => { setPreview(null); setFilename(''); }} className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg p-12 bg-gray-50 text-center text-gray-400 text-sm">
            No file selected
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeRow(raw: any): any {
  const out: any = {};
  Object.keys(raw).forEach((k) => {
    const lk = String(k).toLowerCase().replace(/[\s_-]+/g, '');
    const v = raw[k];
    if (lk.includes('customer')) out.customerCode = String(v).trim();
    else if (lk.includes('department') || lk.includes('dept')) out.departmentCode = String(v).trim();
    else if (lk.includes('storename') || lk === 'store') out.storeName = String(v).trim();
    else if (lk.includes('description') || lk === 'desc') out.description = String(v).trim();
    else if (lk.includes('sensor')) out.sensorCount = parseInt(String(v)) || 0;
    else if (lk.includes('region')) out.storeRegion = String(v).trim().toUpperCase();
    else if (lk.includes('ready')) out.readiness = String(v).trim().toUpperCase().replace(/\s+/g, '_');
    else if (lk.includes('detail')) out.detail = String(v).trim();
    else if (lk.includes('date') || lk.includes('schedule')) out.scheduledDate = String(v).trim();
    else if (lk.includes('province')) out.province = String(v).trim();
  });
  if (!out.description) out.description = 'install Cam';
  if (!out.sensorCount) out.sensorCount = 0;
  return out;
}


function TemplateBtn() {
  const onClick = async () => {
    try {
      const { api } = await import('../api/client');
      const res = await api.get('/installation-plans/template.xlsx', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'ditech-plans-template.xlsx';
      a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { alert('Template download failed: ' + (e?.message || 'unknown')); }
  };
  return (
    <button onClick={onClick}
      className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 inline-flex items-center gap-1">
      📋 Download template
    </button>
  );
}

function ExportBtn() {
  const onClick = async () => {
    try {
      const { api } = await import('../api/client');
      const res = await api.get('/installation-plans/export.xlsx', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ditech-plans-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { alert('Export failed: ' + (e?.message || 'unknown')); }
  };
  return (
    <button onClick={onClick}
      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1">
      ⬇ Export current plans
    </button>
  );
}

