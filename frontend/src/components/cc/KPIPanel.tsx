interface Props {
  kpi: {
    totalPlans: number;
    todayCount: number;
    weekAheadCount: number;
    completedThisMonth: number;
    readyCount: number;
    notReadyCount: number;
    totalSensors: number;
  };
}

const tiles = (kpi: Props['kpi']) => [
  { label: 'Today', value: kpi.todayCount, suffix: 'jobs', color: 'emerald', icon: '📅' },
  { label: 'This week ahead', value: kpi.weekAheadCount, suffix: 'plans', color: 'sky', icon: '🗓' },
  { label: 'Ready', value: kpi.readyCount, suffix: 'branches', color: 'green', icon: '🟢' },
  { label: 'Not ready', value: kpi.notReadyCount, suffix: 'branches', color: 'red', icon: '🔴' },
  { label: 'Completed (month)', value: kpi.completedThisMonth, suffix: 'jobs', color: 'violet', icon: '✅' },
  { label: 'Total sensors', value: kpi.totalSensors, suffix: 'cameras', color: 'amber', icon: '📷' },
  { label: 'All plans', value: kpi.totalPlans, suffix: 'records', color: 'zinc', icon: '📊' },
];

const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  sky:     { bg: 'bg-sky-500/10',     text: 'text-sky-300',     border: 'border-sky-500/30' },
  green:   { bg: 'bg-green-500/10',   text: 'text-green-300',   border: 'border-green-500/30' },
  red:     { bg: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/30' },
  violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-300',  border: 'border-violet-500/30' },
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30' },
  zinc:    { bg: 'bg-zinc-500/10',    text: 'text-zinc-300',    border: 'border-zinc-500/30' },
};

export function KPIPanel({ kpi }: Props) {
  return (
    <div className="h-full">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-4">Key performance indicators</div>
      <div className="grid grid-cols-3 gap-4">
        {tiles(kpi).slice(0, 6).map((t) => {
          const c = colorClasses[t.color];
          return (
            <div key={t.label}
              className={`${c.bg} ${c.border} border rounded-lg p-5`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400">{t.label}</div>
                <div className="text-lg">{t.icon}</div>
              </div>
              <div className={`text-5xl font-mono font-bold ${c.text}`}>
                {t.value.toLocaleString()}
              </div>
              <div className="text-xs text-zinc-500 mt-1">{t.suffix}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom strip — total plans */}
      <div className="mt-6 grid grid-cols-1 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">All-time plans</div>
            <div className="text-3xl font-mono font-bold text-zinc-100 mt-1">
              {kpi.totalPlans.toLocaleString()}
            </div>
          </div>
          <div className="text-4xl opacity-30">📊</div>
        </div>
      </div>
    </div>
  );
}
