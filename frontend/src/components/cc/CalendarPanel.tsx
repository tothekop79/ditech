interface Props {
  todays: any[];
  tomorrows: any[];
}

const statusColor = (s: string) => {
  if (s === 'COMPLETED') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (s === 'IN_PROGRESS') return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
  if (s === 'CONFIRMED') return 'bg-violet-500/20 text-violet-300 border-violet-500/40';
  if (s === 'CANCELLED') return 'bg-red-500/20 text-red-300 border-red-500/40';
  return 'bg-zinc-700 text-zinc-400 border-zinc-600';
};

function PlanCard({ p }: { p: any }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">
            {p.customer?.customerCode || '-'}
          </div>
          <div className="text-base font-semibold text-zinc-100 truncate">{p.storeName}</div>
          {p.branchName && <div className="text-xs text-zinc-400">{p.branchName}</div>}
        </div>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${statusColor(p.planStatus)}`}>
          {p.planStatus}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
        {p.workStartTime && <span>🕐 {p.workStartTime}–{p.workEndTime || '?'}</span>}
        <span>👥 {p.team?.name || 'Unassigned'}</span>
        <span>📷 {p.sensorCount || 0}</span>
      </div>
    </div>
  );
}

export function CalendarPanel({ todays, tomorrows }: Props) {
  return (
    <div className="h-full grid grid-cols-2 gap-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-emerald-300">📅 Today</div>
          <div className="text-xs text-zinc-500">{todays.length} jobs</div>
        </div>
        {todays.length === 0 ? (
          <div className="text-center text-zinc-600 py-12 italic">— ไม่มีงานวันนี้ —</div>
        ) : (
          <div className="space-y-2">
            {todays.slice(0, 8).map((p) => <PlanCard key={p.id} p={p} />)}
            {todays.length > 8 && (
              <div className="text-center text-xs text-zinc-500 italic pt-2">
                +{todays.length - 8} more jobs
              </div>
            )}
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-sky-300">🗓 Tomorrow</div>
          <div className="text-xs text-zinc-500">{tomorrows.length} jobs</div>
        </div>
        {tomorrows.length === 0 ? (
          <div className="text-center text-zinc-600 py-12 italic">— ไม่มีงานพรุ่งนี้ —</div>
        ) : (
          <div className="space-y-2">
            {tomorrows.slice(0, 8).map((p) => <PlanCard key={p.id} p={p} />)}
            {tomorrows.length > 8 && (
              <div className="text-center text-xs text-zinc-500 italic pt-2">
                +{tomorrows.length - 8} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
