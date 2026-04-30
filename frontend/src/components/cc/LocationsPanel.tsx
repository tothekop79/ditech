interface Props {
  byRegion: { BANGKOK: any[]; UPC: any[] };
}

export function LocationsPanel({ byRegion }: Props) {
  const total = byRegion.BANGKOK.length + byRegion.UPC.length;

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs uppercase tracking-widest text-zinc-500">📍 Locations (next 7 days)</div>
        <div className="text-xs text-zinc-600">{total} branches · map view coming soon</div>
      </div>

      <div className="grid grid-cols-2 gap-6 h-[calc(100%-2rem)]">
        {/* Bangkok column */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏙</span>
              <div>
                <div className="text-sm font-semibold text-sky-300">Bangkok</div>
                <div className="text-xs text-zinc-500">Greater BKK metro</div>
              </div>
            </div>
            <div className="text-2xl font-mono font-bold text-sky-400">{byRegion.BANGKOK.length}</div>
          </div>
          <div className="space-y-1.5">
            {byRegion.BANGKOK.length === 0 ? (
              <div className="text-zinc-600 italic text-sm py-6 text-center">— No upcoming plans —</div>
            ) : (
              byRegion.BANGKOK.map((p) => (
                <div key={p.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{p.storeName}</div>
                    <div className="text-[10px] text-zinc-500">
                      {p.customer?.customerCode} · {p.province || '—'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* UPC column */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌾</span>
              <div>
                <div className="text-sm font-semibold text-amber-300">Upcountry</div>
                <div className="text-xs text-zinc-500">Provincial branches</div>
              </div>
            </div>
            <div className="text-2xl font-mono font-bold text-amber-400">{byRegion.UPC.length}</div>
          </div>
          <div className="space-y-1.5">
            {byRegion.UPC.length === 0 ? (
              <div className="text-zinc-600 italic text-sm py-6 text-center">— No upcoming plans —</div>
            ) : (
              byRegion.UPC.map((p) => (
                <div key={p.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{p.storeName}</div>
                    <div className="text-[10px] text-zinc-500">
                      {p.customer?.customerCode} · {p.province || '—'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
