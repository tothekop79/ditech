import { useState } from 'react';
import { fmtDate, shiftDate, toDateInput, type ContractInput } from '../../api/monitor';

/** Shared shell so the three contract dialogs look the same on both pages. */
function Shell({ title, subtitle, children, onClose }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export interface ContractModalProps {
  title: string;
  subtitle?: string;
  /** current values — ISO strings from the API */
  contractStart?: string | null;
  contractEnd?: string | null;
  contractNote?: string | null;
  /** renew: start = old end + 1 day, end = start + 1 year, and the old end is appended to the note */
  renew?: boolean;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (body: ContractInput) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function ContractModal({
  title,
  subtitle,
  contractStart,
  contractEnd,
  contractNote,
  renew,
  submitting,
  onClose,
  onSubmit,
}: ContractModalProps) {
  const [start, setStart] = useState(() => {
    if (!renew) return toDateInput(contractStart);
    const base = toDateInput(contractEnd);
    return base ? shiftDate(base, { days: 1 }) : today();
  });
  const [end, setEnd] = useState(() => {
    if (!renew) return toDateInput(contractEnd);
    const base = toDateInput(contractEnd);
    const from = base ? shiftDate(base, { days: 1 }) : today();
    return shiftDate(from, { years: 1 });
  });
  const [note, setNote] = useState(() => {
    const current = contractNote ?? '';
    if (!renew || !contractEnd) return current;
    const line = `ต่อจาก ${fmtDate(contractEnd)}`;
    // append — never overwrite whatever the previous contract recorded
    return current.includes(line) ? current : current ? `${current}\n${line}` : line;
  });

  const invalid = !!start && !!end && end < start;

  return (
    <Shell title={title} subtitle={subtitle} onClose={onClose}>
      <div className="space-y-2 mt-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-600">สัญญาเริ่ม · Start</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mt-0.5"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-600">สิ้นสุด · End</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mt-0.5"
            />
          </div>
        </div>
        {invalid && <div className="text-[11px] text-red-600">วันสิ้นสุดต้องไม่ก่อนวันเริ่ม</div>}
        <div>
          <label className="text-xs text-gray-600">หมายเหตุ · Note</label>
          <textarea
            value={note}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mt-0.5"
            placeholder="เลขที่สัญญา / เงื่อนไข"
          />
        </div>
        <p className="text-[11px] text-gray-400">เว้นว่างไว้ = ล้างค่านั้นออก</p>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={() =>
            onSubmit({ contractStart: start || null, contractEnd: end || null, contractNote: note.trim() || null })
          }
          disabled={invalid || submitting}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Shell>
  );
}

export function CancelSiteModal({
  siteName,
  submitting,
  onClose,
  onConfirm,
}: {
  siteName: string;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (note?: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Shell
      title="ยกเลิกสาขา · Cancel site"
      subtitle={`“${siteName}” จะถูกปิดมอนิเตอร์และแจ้งเตือนที่ค้างอยู่จะถูกปิดทั้งหมด`}
      onClose={onClose}>
      <div className="mt-3">
        <label className="text-xs text-gray-600">เหตุผล · Reason <span className="text-gray-400">(ไม่บังคับ)</span></label>
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mt-0.5"
          placeholder="เช่น ลูกค้ายกเลิกสัญญา 31/12"
        />
        <p className="text-[11px] text-gray-400 mt-1">บันทึกทับหมายเหตุสัญญาเดิม · ประวัติวันที่ยกเลิกจะถูกเก็บไว้</p>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50">
          ไม่ยกเลิก
        </button>
        <button
          onClick={() => onConfirm(reason.trim() || undefined)}
          disabled={submitting}
          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
          {submitting ? 'Cancelling…' : 'ยกเลิกสาขา'}
        </button>
      </div>
    </Shell>
  );
}
