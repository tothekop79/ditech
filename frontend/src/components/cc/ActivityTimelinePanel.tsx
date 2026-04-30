interface Props {
  changes: any[];
  pulse: any[];
}

const fieldEmoji = (field: string) => {
  if (field === 'planStatus') return '🏷';
  if (field === 'readiness') return '✓';
  if (field === 'scheduledDate') return '📅';
  if (field === 'teamId') return '👥';
  return '✏️';
};

const timeAgo = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

export function ActivityTimelinePanel({ changes, pulse }: Props) {
  // Merge: live pulse first (with kind), then historical changes
  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-zinc-500">🔔 Activity timeline</div>
        <div className="text-xs text-zinc-600">live + last 30 changes</div>
      </div>

      <div className="space-y-2 max-w-3xl">
        {/* Live pulse events (newest first) */}
        {pulse.slice(0, 5).map((evt, idx) => (
          <div key={`pulse-${idx}`}
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-3 animate-pulse-slow">
            <div className="text-lg">
              {evt.kind === 'plan:created' ? '🆕' : evt.kind === 'photo:uploaded' ? '📷' : '🔄'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-emerald-200">
                {evt.kind === 'plan:created' && `New plan: ${evt.plan?.storeName || '?'}`}
                {evt.kind === 'plan:updated' && `Updated: ${evt.plan?.storeName || '?'}`}
                {evt.kind === 'photo:uploaded' && `Photo uploaded: ${evt.plan?.storeName || '?'} (${evt.photo?.category || '?'})`}
              </div>
              <div className="text-[10px] text-emerald-400/70 mt-0.5">{timeAgo(evt.at)}</div>
            </div>
            <div className="text-[9px] text-emerald-400/60 uppercase tracking-wider">live</div>
          </div>
        ))}

        {/* Historical changes */}
        {changes.length === 0 && pulse.length === 0 ? (
          <div className="text-center text-zinc-600 italic py-12">— No recent activity —</div>
        ) : (
          changes.slice(0, 25).map((c) => (
            <div key={c.id}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-start gap-3">
              <div className="text-lg opacity-70">{fieldEmoji(c.fieldChanged)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200">
                  <span className="font-semibold">{c.plan?.storeName || '?'}</span>
                  <span className="text-zinc-500 mx-2">·</span>
                  <span className="text-zinc-400">{c.fieldChanged}</span>
                  <span className="text-zinc-500 mx-1.5">→</span>
                  <span className="text-emerald-300 font-mono text-xs">{c.newValue}</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {c.changedBy?.fullName || 'system'} · {timeAgo(c.changedAt)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
