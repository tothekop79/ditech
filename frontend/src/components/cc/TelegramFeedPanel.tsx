interface Feed {
  id?: string;
  recipient: string;
  ruleName?: string;
  rule?: { name: string; trigger: string };
  body?: string;
  errorMessage?: string;
  status: 'SENT' | 'FAILED' | string;
  createdAt: string;
}

interface Props {
  feed: Feed[];
}

const timeShort = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export function TelegramFeedPanel({ feed }: Props) {
  return (
    <>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-base">📡</div>
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500">Telegram</div>
            <div className="text-sm font-semibold text-zinc-100">Realtime feed</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider">live</span>
        </div>
      </div>

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {feed.length === 0 ? (
          <div className="text-center text-zinc-600 italic py-12 text-sm">— No messages yet —</div>
        ) : (
          feed.map((f, i) => {
            const isFailed = f.status === 'FAILED';
            const ruleName = f.ruleName || f.rule?.name || '?';
            return (
              <div key={f.id || i}
                className={`rounded-lg border p-3 ${
                  isFailed
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-emerald-500/5 border-emerald-500/20'
                }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={isFailed ? 'text-red-400' : 'text-emerald-400'}>
                      {isFailed ? '✗' : '✓'}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">{ruleName}</span>
                  </div>
                  <span className="text-[10px] text-zinc-600 font-mono">{timeShort(f.createdAt)}</span>
                </div>
                <div className="text-[11px] text-zinc-400 mb-1">→ {f.recipient}</div>
                {isFailed ? (
                  <div className="text-[11px] text-red-300 font-mono bg-red-500/10 px-2 py-1 rounded">
                    {f.errorMessage || 'Failed'}
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-200 whitespace-pre-wrap leading-snug max-h-32 overflow-y-auto">
                    {f.body || ''}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/40 text-[10px] text-zinc-500 flex items-center justify-between">
        <span>{feed.length} recent messages</span>
        <span className="font-mono">SSE</span>
      </div>
    </>
  );
}
