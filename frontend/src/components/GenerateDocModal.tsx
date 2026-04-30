import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsApi, type DocType, type Document } from '../api/documents';
import { useToast } from './Toast';
import { api } from '../api/client';

interface Props {
  planId: string;
  open: boolean;
  onClose: () => void;
}

const DOC_TYPES: Array<{ value: DocType; label: string; emoji: string; desc: string }> = [
  { value: 'WORK_PERMIT', label: 'Work Permit', emoji: '📄', desc: 'ใบขออนุญาตเข้าปฏิบัติงาน' },
  { value: 'INSTALLATION_CONFIRM', label: 'Installation Confirmation', emoji: '✅', desc: 'แบบฟอร์มยืนยันการติดตั้งกล้องนับคน' },
];

const DEFAULT_WORK_PERMIT_EQUIPMENT = [
  'ชุดไขควง', 'มีดคัตเตอร์', 'เลื่อยเหล็ก', 'กรรไกรตัดสาย', 'บันไดอลูมิเนียม',
  'พัดเทป น้ำสาย', 'เครื่องทดสอบสาย U', 'สายแลน', 'เพล๊กเหล็ก 2 ม้วน',
  'เทปพันสายไฟ', 'ไฟฉาย', 'ชุดสว่านไร้สาย พร้อมแบตเตอรี่', 'ชุดสว่านเจาะยึด', 'กล้องนับคน',
];

const DEFAULT_PRE_INSTALL = [
  'ตรวจสอบจุดติดตั้งกล้องตามแบบที่กำหนด',
  'ติดตั้งกล้องในตำแหน่งเหมาะสม (ความสูง มุมมอง)',
  'เดินสายไฟและสายเครือข่ายเรียบร้อย',
  'เชื่อมต่อกล้องเข้าระบบเครือข่ายสำเร็จ',
];
const DEFAULT_WORKING = [
  'ทดสอบการนับคนเข้า-ออก ทำงานถูกต้อง',
  'ตั้งค่า Zone การนับและ Sensitivity ที่เหมาะสม',
  'ตรวจสอบภาพจากกล้องชัดเจน ไม่มีสิ่งกีดขวาง',
  'ตรวจสอบการส่งข้อมูลไปยัง Server/Dashboard',
];
const DEFAULT_HANDOVER = [
  'แจ้งช่องทางติดต่อฝ่ายสนับสนุน',
  'ทำความสะอาดพื้นที่ติดตั้งเรียบร้อย',
];

// Editable section configs per doc type
type SectionDef = {
  key: 'equipmentList' | 'preInstallChecklist' | 'workingChecklist' | 'handoverChecklist';
  title: string;
  defaults: string[];
};

const SECTIONS_BY_TYPE: Record<DocType, SectionDef[]> = {
  WORK_PERMIT: [
    { key: 'equipmentList', title: 'อุปกรณ์ที่ใช้', defaults: DEFAULT_WORK_PERMIT_EQUIPMENT },
  ],
  INSTALLATION_CONFIRM: [
    { key: 'preInstallChecklist', title: 'รายการตรวจสอบก่อนและการติดตั้ง', defaults: DEFAULT_PRE_INSTALL },
    { key: 'workingChecklist',    title: 'รายการตรวจสอบการทำงาน',         defaults: DEFAULT_WORKING },
    { key: 'handoverChecklist',   title: 'การส่งมอบและอบรม',                defaults: DEFAULT_HANDOVER },
  ],
};

// ─────────────────────── Section Editor (reusable) ───────────────────────
type SectionEditorProps = {
  title: string;
  items: string[];
  onChange: (next: string[]) => void;
  onReset: () => void;
};
function SectionEditor({ title, items, onChange, onReset }: SectionEditorProps) {
  const [newItem, setNewItem] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const add = () => {
    const v = newItem.trim();
    if (!v) return;
    onChange([...items, v]);
    setNewItem('');
  };
  const del = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const startEdit = (i: number) => { setEditingIdx(i); setEditingValue(items[i]); };
  const saveEdit = () => {
    if (editingIdx === null) return;
    const next = [...items];
    next[editingIdx] = editingValue.trim() || next[editingIdx];
    onChange(next);
    setEditingIdx(null);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="border border-gray-200 rounded">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
        <div className="text-xs font-semibold text-slate-700">{title} <span className="text-slate-400 font-normal">({items.length})</span></div>
        <button onClick={onReset}
          className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded hover:bg-white text-gray-600"
          title="คืนค่าเริ่มต้น">↺ Reset</button>
      </div>

      <div className="px-2 py-2 space-y-1 max-h-[200px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-center text-xs text-gray-400 italic py-3">— ไม่มีรายการ —</div>
        ) : items.map((item, idx) => (
          <div key={idx} className="group flex items-center gap-1 bg-white border border-gray-100 rounded px-1.5 py-1 text-xs">
            <span className="text-[9px] text-gray-400 w-4 text-right">{idx + 1}.</span>
            {editingIdx === idx ? (
              <input value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingIdx(null); }}
                autoFocus
                className="flex-1 px-1 py-0.5 border border-blue-300 rounded text-xs outline-none" />
            ) : (
              <span className="flex-1 cursor-pointer hover:text-blue-700 truncate" onClick={() => startEdit(idx)} title="คลิกเพื่อแก้ไข">{item}</span>
            )}
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => move(idx, -1)} disabled={idx === 0}
                className="text-[9px] text-gray-400 hover:text-blue-700 disabled:text-gray-200 px-0.5">↑</button>
              <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
                className="text-[9px] text-gray-400 hover:text-blue-700 disabled:text-gray-200 px-0.5">↓</button>
              <button onClick={() => del(idx)} className="text-[9px] text-gray-400 hover:text-red-600 px-0.5">✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="px-2 py-1.5 border-t bg-white flex gap-1">
        <input value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="เพิ่มรายการ..."
          className="flex-1 px-1.5 py-1 text-xs border border-gray-300 rounded outline-none focus:border-blue-400" />
        <button onClick={add}
          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">+ Add</button>
      </div>
    </div>
  );
}

// ─────────────────────── Modal ───────────────────────
export default function GenerateDocModal({ planId, open, onClose }: Props) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

  // Per-section editable lists
  const [sectionData, setSectionData] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents', planId],
    queryFn: () => documentsApi.list(planId),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (docType: DocType) => documentsApi.create(planId, docType),
    onSuccess: (doc) => {
      showToast(`Generated ${doc.docNumber}`);
      qc.invalidateQueries({ queryKey: ['documents', planId] });
      setPreviewDoc(doc);
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to generate'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentsApi.delete(id),
    onSuccess: () => {
      showToast('Document deleted');
      qc.invalidateQueries({ queryKey: ['documents', planId] });
      setPreviewDoc(null);
    },
  });

  const saveAllMutation = useMutation({
    mutationFn: () => documentsApi.update(previewDoc!.id, sectionData as any),
    onSuccess: () => {
      showToast('Sections saved');
      setDirty(false);
      if (previewDoc) loadPreview(previewDoc);
      qc.invalidateQueries({ queryKey: ['documents', planId] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to save'),
  });

  // Sync section data when previewDoc changes
  useEffect(() => {
    if (previewDoc) {
      const sections = SECTIONS_BY_TYPE[previewDoc.docType] || [];
      const next: Record<string, string[]> = {};
      sections.forEach((s) => {
        const existing = (previewDoc as any)[s.key] as string[] | null;
        next[s.key] = existing && existing.length ? [...existing] : [...s.defaults];
      });
      setSectionData(next);
      setDirty(false);
    }
  }, [previewDoc?.id]);

  const updateSection = (key: string, items: string[]) => {
    setSectionData((prev) => ({ ...prev, [key]: items }));
    setDirty(true);
  };
  const resetSection = (key: string) => {
    if (!previewDoc) return;
    const def = SECTIONS_BY_TYPE[previewDoc.docType].find((s) => s.key === key);
    if (def) {
      setSectionData((prev) => ({ ...prev, [key]: [...def.defaults] }));
      setDirty(true);
    }
  };

  // PDF actions
  const downloadPdf = async (doc: Document) => {
    try {
      const res = await api.get(`/documents/${doc.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.docNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('PDF downloaded');
    } catch {
      showToast('Failed to download PDF');
    }
  };

  const openPdfInTab = async (doc: Document) => {
    try {
      const res = await api.get(`/documents/${doc.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('Failed to open PDF');
    }
  };

  const [previewHtmlUrl, setPreviewHtmlUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const loadPreview = async (doc: Document) => {
    setPreviewLoading(true);
    try {
      const res = await api.get(`/documents/${doc.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewHtmlUrl(url + '#view=Fit&toolbar=0');
    } catch {
      setPreviewHtmlUrl('');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (previewDoc && !previewHtmlUrl && !previewLoading) {
      loadPreview(previewDoc);
    }
  }, [previewDoc]);

  const closePreview = () => {
    if (previewHtmlUrl) URL.revokeObjectURL(previewHtmlUrl.split('#')[0]);
    setPreviewDoc(null);
    setPreviewHtmlUrl('');
    setDirty(false);
    setSectionData({});
  };

  if (!open) return null;

  // ────────────── PREVIEW VIEW ──────────────
  if (previewDoc) {
    const sections = SECTIONS_BY_TYPE[previewDoc.docType] || [];
    const showEditor = sections.length > 0;
    return (
      <div className="fixed inset-0 bg-slate-800/30 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={closePreview}>
        <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: 'min(98vw, 1400px)', height: 'min(96vh, 1200px)' }} onClick={(e) => e.stopPropagation()}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <div>
              <div className="text-xs text-gray-500">Document</div>
              <div className="font-semibold text-gray-900">
                {previewDoc.docType === 'WORK_PERMIT' ? '📄 Work Permit' : '✅ Installation Confirmation'} · <span className="font-mono text-sm">{previewDoc.docNumber}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openPdfInTab(previewDoc)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">🔍 Open in new tab</button>
              <button onClick={() => downloadPdf(previewDoc)}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">⬇ Download PDF</button>
              <button onClick={closePreview}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">✕ Close</button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex">
            {showEditor && (
              <div className="w-[360px] border-r bg-slate-50 flex flex-col">
                <div className="px-4 py-2.5 border-b bg-white">
                  <div className="text-xs uppercase tracking-wider text-gray-500">Editable sections</div>
                  <div className="text-sm font-semibold text-gray-900">แก้ไขรายการในเอกสาร</div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                  {sections.map((s) => (
                    <SectionEditor
                      key={s.key}
                      title={s.title}
                      items={sectionData[s.key] || []}
                      onChange={(next) => updateSection(s.key, next)}
                      onReset={() => resetSection(s.key)}
                    />
                  ))}
                </div>

                {dirty && (
                  <div className="px-3 py-2 border-t bg-white">
                    <button onClick={() => saveAllMutation.mutate()}
                      disabled={saveAllMutation.isPending}
                      className="w-full px-3 py-2 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 font-medium">
                      {saveAllMutation.isPending ? 'Saving…' : '💾 Save all & refresh preview'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-hidden bg-slate-100 p-3">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <div className="text-sm">Rendering PDF…</div>
                </div>
              ) : previewHtmlUrl ? (
                <iframe src={previewHtmlUrl} className="w-full h-full border-0 rounded shadow-md bg-white" title="Document preview" />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">Loading preview…</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ────────────── LIST + CREATE VIEW ──────────────
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold text-gray-900">📄 Documents</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-2">✕</button>
        </div>

        <div className="px-5 py-4 border-b">
          <div className="text-sm font-semibold text-gray-700 mb-2">Generate new</div>
          <div className="grid grid-cols-2 gap-2">
            {DOC_TYPES.map((dt) => (
              <button key={dt.value}
                onClick={() => createMutation.mutate(dt.value)}
                disabled={createMutation.isPending}
                className="text-left p-3 border border-gray-300 rounded hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                <div className="text-sm font-semibold text-gray-900 mb-1">{dt.emoji} {dt.label}</div>
                <div className="text-xs text-gray-500">{dt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="text-sm font-semibold text-gray-700 mb-2">Existing documents</div>
          {isLoading ? (
            <div className="py-6 text-center text-sm text-gray-400">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">No documents generated yet</div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {doc.docType === 'WORK_PERMIT' ? '📄' : '✅'} {doc.docType.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      <span className="font-mono">{doc.docNumber}</span> · <span>{new Date(doc.createdAt).toLocaleString()}</span>
                      {doc.createdBy?.fullName && <span> · by {doc.createdBy.fullName}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 ml-3">
                    <button onClick={() => setPreviewDoc(doc)}
                      className="px-2.5 py-1 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50">👁 Preview</button>
                    <button onClick={() => downloadPdf(doc)}
                      className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">⬇ PDF</button>
                    <button onClick={() => { if (confirm(`Delete ${doc.docNumber}?`)) deleteMutation.mutate(doc.id); }}
                      className="px-2.5 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50">🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
