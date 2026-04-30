import { useQuery } from '@tanstack/react-query';
import { capacityApi } from '../api/capacity';
import { Spinner } from '../components/Spinner';

export function AlertsPage() {
  const { data: conflicts, isLoading } = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => capacityApi.conflicts(),
  });

  if (isLoading) return <Spinner />;

  const cs = conflicts || [];
  const grouped = {
    'region-overload': cs.filter((c) => c.type === 'region-overload'),
    'team-overload': cs.filter((c) => c.type === 'team-overload'),
    'not-ready-soon': cs.filter((c) => c.type === 'not-ready-soon'),
    'no-team': cs.filter((c) => c.type === 'no-team'),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Alerts &amp; conflicts</h2>
        <span className="text-sm text-gray-500">{cs.length} active</span>
      </div>

      {cs.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">All clear</div>
      ) : (
        <div className="space-y-3">
          {grouped['region-overload'].length > 0 && (
            <Section title={`Region over capacity (${grouped['region-overload'].length})`} color="red">
              {grouped['region-overload'].map((c: any, i) => (
                <div key={i} className="py-2 border-t border-gray-100 first:border-0 text-sm">
                  <strong>{c.date}</strong> · {c.region}: {c.used} jobs / {c.cap} team{c.cap > 1 ? 's' : ''}
                </div>
              ))}
            </Section>
          )}
          {grouped['team-overload'].length > 0 && (
            <Section title={`Team double-booked (${grouped['team-overload'].length})`} color="red">
              {grouped['team-overload'].map((c: any, i) => (
                <div key={i} className="py-2 border-t border-gray-100 first:border-0 text-sm">
                  <strong>{c.teamName}</strong> on <strong>{c.date}</strong> · {c.plans.length} jobs
                  <div className="text-xs text-gray-500 mt-0.5">{c.plans.map((p: any) => p.storeName).join(' · ')}</div>
                </div>
              ))}
            </Section>
          )}
          {grouped['not-ready-soon'].length > 0 && (
            <Section title={`Not ready, scheduled within 7 days (${grouped['not-ready-soon'].length})`} color="amber">
              {grouped['not-ready-soon'].map((c: any, i) => {
                const dl = new Date(c.plan.scheduledDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                const dayLbl = c.daysUntil === 0 ? 'today' : c.daysUntil === 1 ? 'tomorrow' : `in ${c.daysUntil} days`;
                return (
                  <div key={i} className="py-2 border-t border-gray-100 first:border-0 text-sm">
                    <strong>{c.plan.storeName}</strong> — {dl} ({dayLbl})
                    <div className="text-xs text-gray-500 mt-0.5">{c.plan.detail || '—'}</div>
                  </div>
                );
              })}
            </Section>
          )}
          {grouped['no-team'].length > 0 && (
            <Section title={`Ready but no team assigned (${grouped['no-team'].length})`} color="amber">
              {grouped['no-team'].map((c: any, i) => {
                const dl = new Date(c.plan.scheduledDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                return (
                  <div key={i} className="py-2 border-t border-gray-100 first:border-0 text-sm">
                    <strong>{c.plan.storeName}</strong> · {dl} · {c.plan.province || '—'}
                  </div>
                );
              })}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, color, children }: any) {
  const colorMap: any = { red: 'text-red-700', amber: 'text-amber-700' };
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className={`text-sm font-medium mb-1 ${colorMap[color]}`}>{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
