interface Props {
  teams: Array<{
    id: string;
    name: string;
    region: string;
    dailyCap: number;
    hasChatId: boolean;
    weekLoad: number;
    breakdown: { confirmed: number; inProgress: number; completed: number; draft: number };
  }>;
}

export function TeamWorkloadPanel({ teams }: Props) {
  const maxLoad = Math.max(...teams.map(t => t.weekLoad), 1);

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs uppercase tracking-widest text-zinc-500">👥 Team workload (next 7 days)</div>
        <div className="text-xs text-zinc-600">{teams.length} teams</div>
      </div>

      <div className="space-y-3">
        {teams
          .sort((a, b) => b.weekLoad - a.weekLoad)
          .map((t) => {
            const pct = (t.weekLoad / maxLoad) * 100;
            return (
              <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-zinc-100">{t.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${
                      t.region === 'BANGKOK'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>{t.region}</span>
                    <span className={`text-xs ${t.hasChatId ? 'text-emerald-400' : 'text-zinc-600'}`}
                      title={t.hasChatId ? 'Telegram configured' : 'No Telegram chat ID'}>
                      {t.hasChatId ? '✓ Telegram' : '— No chat'}
                    </span>
                  </div>
                  <div className="font-mono text-2xl font-bold text-zinc-100">{t.weekLoad}</div>
                </div>

                {/* Stacked bar by status */}
                <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800 mb-2">
                  {t.breakdown.completed > 0 && (
                    <div className="bg-emerald-500" style={{ width: `${(t.breakdown.completed / Math.max(t.weekLoad, 1)) * 100}%` }} />
                  )}
                  {t.breakdown.inProgress > 0 && (
                    <div className="bg-sky-500" style={{ width: `${(t.breakdown.inProgress / Math.max(t.weekLoad, 1)) * 100}%` }} />
                  )}
                  {t.breakdown.confirmed > 0 && (
                    <div className="bg-violet-500" style={{ width: `${(t.breakdown.confirmed / Math.max(t.weekLoad, 1)) * 100}%` }} />
                  )}
                  {t.breakdown.draft > 0 && (
                    <div className="bg-zinc-600" style={{ width: `${(t.breakdown.draft / Math.max(t.weekLoad, 1)) * 100}%` }} />
                  )}
                </div>

                <div className="flex gap-4 text-xs text-zinc-500">
                  {t.breakdown.completed > 0 && <span>✅ {t.breakdown.completed} done</span>}
                  {t.breakdown.inProgress > 0 && <span className="text-sky-400">⚙ {t.breakdown.inProgress} active</span>}
                  {t.breakdown.confirmed > 0 && <span className="text-violet-400">📅 {t.breakdown.confirmed} confirmed</span>}
                  {t.breakdown.draft > 0 && <span>📝 {t.breakdown.draft} draft</span>}
                </div>
              </div>
            );
          })}

        {teams.length === 0 && (
          <div className="text-center text-zinc-600 italic py-12">— No active teams —</div>
        )}
      </div>
    </div>
  );
}
