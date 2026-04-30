import { useEffect, useState, useRef, useCallback } from 'react';
import { commandCenterApi, type CCSnapshot } from '../api/commandCenter';
import { KPIPanel } from '../components/cc/KPIPanel';
import { CalendarPanel } from '../components/cc/CalendarPanel';
import { ActivityTimelinePanel } from '../components/cc/ActivityTimelinePanel';
import { TeamWorkloadPanel } from '../components/cc/TeamWorkloadPanel';
import { LocationsPanel } from '../components/cc/LocationsPanel';
import { TelegramFeedPanel } from '../components/cc/TelegramFeedPanel';

const ROTATION_INTERVAL_MS = 30_000;

const PANELS = [
  { key: 'kpi',      label: 'KPI Overview',     icon: '📊' },
  { key: 'calendar', label: "Today's schedule", icon: '📅' },
  { key: 'activity', label: 'Activity timeline', icon: '🔔' },
  { key: 'team',     label: 'Team workload',    icon: '👥' },
  { key: 'location', label: 'Locations',        icon: '📍' },
] as const;

type PanelKey = typeof PANELS[number]['key'];

export default function CommandCenterPage() {
  const [snapshot, setSnapshot] = useState<CCSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Panel rotation
  const [activePanel, setActivePanel] = useState<PanelKey>('kpi');
  const [paused, setPaused] = useState(false);
  const rotationTimer = useRef<number | null>(null);

  // Live stream events
  const [telegramFeed, setTelegramFeed] = useState<any[]>([]);
  const [activityPulse, setActivityPulse] = useState<any[]>([]);
  const [ssedConnected, setSsedConnected] = useState(false);

  // Clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ─── Initial snapshot fetch ───
  const fetchSnapshot = useCallback(async () => {
    try {
      const data = await commandCenterApi.snapshot();
      setSnapshot(data);
      setTelegramFeed(data.recentTelegramLogs || []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load snapshot');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    // Periodic full re-sync every 60s
    const t = setInterval(fetchSnapshot, 60_000);
    return () => clearInterval(t);
  }, [fetchSnapshot]);

  // ─── SSE connection ───
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const url = commandCenterApi.streamUrl(token);
    const es = new EventSource(url);

    es.addEventListener('hello', () => setSsedConnected(true));
    es.addEventListener('tick',  () => { /* keepalive */ });

    es.addEventListener('notification:sent', (ev: any) => {
      try {
        const data = JSON.parse(ev.data);
        setTelegramFeed(prev => [data, ...prev].slice(0, 30));
      } catch { /* noop */ }
    });

    es.addEventListener('notification:failed', (ev: any) => {
      try {
        const data = JSON.parse(ev.data);
        setTelegramFeed(prev => [data, ...prev].slice(0, 30));
      } catch { /* noop */ }
    });

    es.addEventListener('plan:created', (ev: any) => {
      try {
        const data = JSON.parse(ev.data);
        setActivityPulse(prev => [{ kind: 'plan:created', at: new Date().toISOString(), ...data }, ...prev].slice(0, 20));
      } catch { /* noop */ }
    });

    es.addEventListener('plan:updated', (ev: any) => {
      try {
        const data = JSON.parse(ev.data);
        setActivityPulse(prev => [{ kind: 'plan:updated', at: new Date().toISOString(), ...data }, ...prev].slice(0, 20));
      } catch { /* noop */ }
    });

    es.addEventListener('photo:uploaded', (ev: any) => {
      try {
        const data = JSON.parse(ev.data);
        setActivityPulse(prev => [{ kind: 'photo:uploaded', at: new Date().toISOString(), ...data }, ...prev].slice(0, 20));
      } catch { /* noop */ }
    });

    es.onerror = () => setSsedConnected(false);

    return () => { es.close(); };
  }, []);

  // ─── Carousel rotation ───
  useEffect(() => {
    if (paused) return;
    rotationTimer.current = window.setInterval(() => {
      setActivePanel(prev => {
        const idx = PANELS.findIndex(p => p.key === prev);
        return PANELS[(idx + 1) % PANELS.length].key;
      });
    }, ROTATION_INTERVAL_MS);
    return () => {
      if (rotationTimer.current) window.clearInterval(rotationTimer.current);
    };
  }, [paused]);

  // ─── Fullscreen toggle ───
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
          <div className="text-sm text-zinc-400">Loading Command Center…</div>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-red-400 flex items-center justify-center">
        <div>⚠ {error || 'Snapshot unavailable'}</div>
      </div>
    );
  }

  const renderPanel = () => {
    switch (activePanel) {
      case 'kpi':      return <KPIPanel kpi={snapshot.kpi} />;
      case 'calendar': return <CalendarPanel todays={snapshot.todaysList} tomorrows={snapshot.tomorrowsList} />;
      case 'activity': return <ActivityTimelinePanel changes={snapshot.recentChanges} pulse={activityPulse} />;
      case 'team':     return <TeamWorkloadPanel teams={snapshot.teams} />;
      case 'location': return <LocationsPanel byRegion={snapshot.byRegion} />;
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950 text-zinc-100 overflow-hidden flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🛰️</div>
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500">DITECH</div>
            <div className="text-lg font-semibold tracking-wider">Command Center</div>
          </div>
        </div>

        {/* Panel selector */}
        <div className="flex items-center gap-1.5">
          {PANELS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setActivePanel(p.key); setPaused(true); }}
              className={`px-3 py-1.5 text-xs rounded font-medium transition ${
                activePanel === p.key
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-transparent'
              }`}>
              <span className="mr-1">{p.icon}</span>{p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setPaused(p => !p)}
            className={`px-3 py-1.5 text-xs rounded border ${
              paused
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
            }`}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button onClick={toggleFullscreen}
            className="px-3 py-1.5 text-xs rounded border bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700">
            ⛶ Fullscreen
          </button>
          <div className="flex flex-col items-end ml-3 leading-tight">
            <div className="text-2xl font-mono font-semibold text-emerald-300">
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
              {now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div className={`w-2 h-2 rounded-full ${ssedConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
               title={ssedConnected ? 'Live connection active' : 'Live connection offline'} />
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: rotating panel */}
        <main className="flex-1 p-6 overflow-y-auto">
          {renderPanel()}
        </main>

        {/* Right (fixed): Telegram feed */}
        <aside className="w-[420px] border-l border-zinc-800 bg-zinc-950 flex flex-col">
          <TelegramFeedPanel feed={telegramFeed} />
        </aside>
      </div>

      {/* Bottom progress bar showing rotation timer */}
      {!paused && (
        <div className="absolute bottom-0 left-0 h-0.5 bg-emerald-500/60 transition-all"
             style={{
               width: `${((PANELS.findIndex(p => p.key === activePanel) + 1) / PANELS.length) * 100}%`
             }} />
      )}
    </div>
  );
}
