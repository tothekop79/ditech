import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { capacityApi } from '../api/capacity';
import { masterApi } from '../api/master';
import { plansApi } from '../api/plans';
import { monthRange } from '../lib/dates';
import { Spinner } from '../components/Spinner';

export function CapacityPage() {
  const [cursor, setCursor] = useState(new Date());
  const year = cursor.getFullYear(); const month = cursor.getMonth() + 1;
  const { from, to } = monthRange(cursor);

  const { data: heatmap, isLoading: hLoad } = useQuery({
    queryKey: ['heatmap', year, month],
    queryFn: () => capacityApi.heatmap(year, month),
  });
  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: masterApi.teams });
  const { data: plans } = useQuery({
    queryKey: ['plans-cap', from, to],
    queryFn: () => plansApi.list({ scheduledFrom: from, scheduledTo: to, limit: 300 }),
  });

  const days = heatmap || [];
  const teamPlans = plans?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setCursor(new Date(year, month - 2, 1))} className="w-8 h-8 border border-gray-300 rounded hover:bg-gray-100">‹</button>
        <span className="text-base font-medium min-w-[180px] text-center">
          {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => setCursor(new Date(year, month, 1))} className="w-8 h-8 border border-gray-300 rounded hover:bg-gray-100">›</button>
      </div>

      {hLoad ? <Spinner /> : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-base font-medium mb-3">Team utilization</h3>
            <div className="space-y-2">
              {(teams || []).map((t) => {
                const total = days.length * t.dailyCap;
                const used = teamPlans.filter((p: any) => p.teamId === t.id).length;
                const pct = total > 0 ? Math.round((used / total) * 100) : 0;
                const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-green-500';
                return (
                  <div key={t.id} className="grid grid-cols-[100px_1fr_100px] gap-3 items-center py-1.5 border-b border-gray-100 last:border-0">
                    <div className="text-sm">
                      <strong>{t.name}</strong> <span className="text-xs text-gray-400">({t.region === 'BANGKOK' ? 'BKK' : 'UPC'})</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded overflow-hidden">
                      <div className={color + ' h-full transition-all'} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                    </div>
                    <div className="text-right text-xs">{used} / {total} · {pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-base font-medium mb-3">Daily heatmap</h3>
            {(['BANGKOK', 'UPC'] as const).map((region) => {
              const cap = (teams || []).filter((t) => t.region === region).reduce((s, t) => s + t.dailyCap, 0);
              return (
                <div key={region} className="mb-4 last:mb-0">
                  <div className="text-xs font-medium text-gray-500 mb-1.5">
                    {region === 'BANGKOK' ? 'Bangkok' : 'Up-country'} · {cap} jobs/day
                  </div>
                  <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
                    {days.map((d) => {
                      const dayPlans = teamPlans.filter((p: any) =>
                        p.storeRegion === region && p.scheduledDate?.startsWith(d.date)
                      );
                      const used = dayPlans.length;
                      const ratio = cap > 0 ? used / cap : 0;
                      let bg = 'bg-gray-100', fg = 'text-gray-400';
                      if (used > 0) {
                        if (ratio > 1) { bg = 'bg-red-500'; fg = 'text-white'; }
                        else if (ratio === 1) { bg = 'bg-amber-400'; fg = 'text-amber-900'; }
                        else if (ratio >= 0.5) { bg = 'bg-green-300'; fg = 'text-green-900'; }
                        else { bg = 'bg-green-100'; fg = 'text-green-800'; }
                      }
                      return (
                        <div key={d.date} title={`${d.date}: ${used}`}
                          className={`${bg} ${fg} aspect-square rounded flex items-center justify-center text-[10px] font-medium`}>
                          {new Date(d.date).getDate()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
