import { useState } from 'react';

export function ColorLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-gray-200 rounded text-xs">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-gray-50 text-left">
        <span className="text-gray-600 flex items-center gap-1.5">
          <span>ⓘ</span>
          <span className="font-medium">Color Legend</span>
        </span>
        <span className="text-[10px] text-gray-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5">Region</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-1.5 py-0.5 rounded border bg-sky-100 text-sky-700 border-sky-300 text-[11px] font-semibold">BANGKOK</span>
              <span className="px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-300 text-[11px] font-semibold">UPC</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5">Readiness</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-1.5 py-0.5 rounded border bg-green-100 text-green-700 border-green-300 text-[11px] font-semibold">READY</span>
              <span className="px-1.5 py-0.5 rounded border bg-red-100 text-red-700 border-red-300 text-[11px] font-semibold">NOT_READY</span>
              <span className="px-1.5 py-0.5 rounded border bg-orange-100 text-orange-700 border-orange-300 text-[11px] font-semibold">ON_HOLD</span>
              <span className="px-1.5 py-0.5 rounded border bg-gray-100 text-gray-600 border-gray-300 text-[11px] font-semibold">PENDING</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5">Plan status</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-1.5 py-0.5 rounded border bg-gray-100 text-gray-600 border-gray-300 text-[11px] font-semibold">DRAFT</span>
              <span className="px-1.5 py-0.5 rounded border bg-purple-100 text-purple-700 border-purple-300 text-[11px] font-semibold">CONFIRMED</span>
              <span className="px-1.5 py-0.5 rounded border bg-blue-100 text-blue-700 border-blue-300 text-[11px] font-semibold">IN_PROGRESS</span>
              <span className="px-1.5 py-0.5 rounded border bg-green-100 text-green-700 border-green-300 text-[11px] font-semibold">COMPLETED</span>
              <span className="px-1.5 py-0.5 rounded border bg-red-100 text-red-700 border-red-300 text-[11px] font-semibold line-through">CANCELLED</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
