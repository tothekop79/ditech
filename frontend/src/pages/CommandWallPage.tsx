import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { commandCenterApi, type CCSnapshot } from '../api/commandCenter';

const REFRESH_INTERVAL_MS = 30_000;

// Work scope label + icon mapping
const WORK_SCOPE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  INSTALL_CAMERA: { label: 'Camera',     icon: '📷', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  INSTALL_LAN:    { label: 'LAN',        icon: '🔌', color: 'bg-green-500/15 text-green-300 border-green-500/30' },
  INSTALL_POE:    { label: 'POE',        icon: '⚡', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  CALIBRATION:    { label: 'Calibrate',  icon: '🎯', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  TESTING:        { label: 'Test',       icon: '✓',  color: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
  CLOUD_SETUP:    { label: 'Cloud',      icon: '☁️', color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  MAINTENANCE:    { label: 'Maintenance',icon: '🔧', color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
};

const PHOTO_CATEGORY_TH: Record<string, string> = {
  BEFORE: 'ก่อนติดตั้ง', DURING: 'ระหว่างติดตั้ง', AFTER: 'หลังติดตั้ง',
  EQUIPMENT: 'อุปกรณ์', ISSUE: 'ปัญหา', HANDOVER: 'ส่งมอบ', OTHER: 'อื่นๆ',
};

const FIELD_TH: Record<string, string> = {
  planStatus: 'สถานะแผน',
  readiness: 'ความพร้อม',
  scheduledDate: 'วันที่ติดตั้ง',
  teamId: 'ทีม',
  contactPerson: 'ผู้ติดต่อ',
  workStartTime: 'เวลาเริ่มงาน',
  workEndTime: 'เวลาสิ้นสุด',
  sensorCount: 'จำนวนกล้อง',
};

const statusChip = (s: string) => {
  if (s === 'COMPLETED') return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
  if (s === 'IN_PROGRESS') return 'text-sky-300 bg-sky-500/10 border-sky-500/30';
  if (s === 'CONFIRMED') return 'text-violet-300 bg-violet-500/10 border-violet-500/30';
  if (s === 'CANCELLED') return 'text-red-300 bg-red-500/10 border-red-500/30';
  return 'text-zinc-400 bg-zinc-700/40 border-zinc-600';
};

const readinessChip = (r: string) => {
  if (r === 'READY') return 'text-emerald-300 bg-emerald-500/10';
  if (r === 'NOT_READY') return 'text-red-300 bg-red-500/10';
  if (r === 'ON_HOLD') return 'text-amber-300 bg-amber-500/10';
  return 'text-zinc-400 bg-zinc-700/40';
};

const timeShort = (iso: string) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
const timeAgo = (iso: string) => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
};
const formatDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
};
const formatDateLong = (iso: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type CalendarView = 'month' | 'week' | 'day';

export default function CommandWallPage() {
  const [snapshot, setSnapshot] = useState<CCSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [telegramFeed, setTelegramFeed] = useState<any[]>([]);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  const [ssedConnected, setSsedConnected] = useState(false);
  const [now, setNow] = useState(new Date());

  // Calendar interaction
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  // Default to today so the side panel shows the current day on first load
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }); // YYYY-MM-DD
  const [calendarRefDate, setCalendarRefDate] = useState(new Date());

  // Sound notifications
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isInitialLoad = useRef(true);
  const feedScrollRef = useRef<HTMLDivElement | null>(null);
  const soundEnabledRef = useRef(true);

  // Init audio element
  useEffect(() => {
    const audio = new Audio('/ding-notification.wav');
    audio.volume = 0.6;
    audio.preload = 'auto';
    audioRef.current = audio;
  }, []);

  // Sync soundEnabled state into ref so SSE handler reads latest value
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Snapshot fetch
  const fetchSnapshot = useCallback(async () => {
    try {
      const data = await commandCenterApi.snapshot();
      setSnapshot(data);
      // Initial load — fill feed but don't ding
      if (isInitialLoad.current) {
        // Reverse so newest at end (we render column-reverse)
        setTelegramFeed((data.recentTelegramLogs || []).slice().reverse());
        isInitialLoad.current = false;
      }
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const t = setInterval(fetchSnapshot, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchSnapshot]);

  // SSE for new live notifications (will append to bottom)
  useEffect(() => {
    const token = localStorage.getItem('ditech_token');
    if (!token) return;
    const url = commandCenterApi.streamUrl(token);
    const es = new EventSource(url);
    es.addEventListener('hello', () => setSsedConnected(true));

    const handleNotif = (ev: any) => {
      console.log('[Wall SSE]', ev.type, ev.data?.substring(0, 100));
      try {
        const data = JSON.parse(ev.data);
        const msgId = data.id || `${data.recipient}-${data.createdAt}`;
        // Append to end (newest at bottom)
        setTelegramFeed(prev => [...prev, data].slice(-50));
        // Mark as new for highlight (3s glow)
        setNewMessageIds(prev => new Set(prev).add(msgId));
        setTimeout(() => {
          setNewMessageIds(prev => {
            const next = new Set(prev);
            next.delete(msgId);
            return next;
          });
        }, 10000);
        // Play ding (only if user has enabled & not initial load)
        if (soundEnabledRef.current && !isInitialLoad.current && audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => { /* user gesture not yet given */ });
        }
      } catch { /* noop */ }
    };

    es.addEventListener('notification:sent', handleNotif);
    es.addEventListener('notification:failed', handleNotif);
    es.onerror = () => setSsedConnected(false);
    return () => { es.close(); };
  }, []); // SSE setup once, soundEnabled accessed via ref

  // No auto-scroll needed — flex-direction: column-reverse keeps
  // newest message visible at bottom natively. Browser scroll is
  // anchored to the bottom by default with this layout.

  // Calendar derived: filtered cells based on view
  const visibleCells = useMemo(() => {
    if (!snapshot) return [];
    const cells = snapshot.monthCalendar.cells;
    if (calendarView === 'month') return cells;
    if (calendarView === 'week') {
      // Find week containing selectedDate (or today)
      const target = selectedDate || dayKey(now);
      const idx = cells.findIndex(c => c.date === target);
      if (idx < 0) return cells.slice(0, 7);
      const weekStart = Math.floor(idx / 7) * 7;
      return cells.slice(weekStart, weekStart + 7);
    }
    if (calendarView === 'day') {
      const target = selectedDate || dayKey(now);
      const cell = cells.find(c => c.date === target);
      return cell ? [cell] : [];
    }
    return cells;
  }, [snapshot, calendarView, selectedDate, now]);

  // Get plans for selected date
  const selectedDayPlans = useMemo(() => {
    if (!snapshot || !selectedDate) return null;
    const cell = snapshot.monthCalendar.cells.find(c => c.date === selectedDate);
    return cell ? cell.plans : null;
  }, [snapshot, selectedDate]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
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

  const { kpi, monthCalendar, upcoming30Days, teams, recentChanges, todaysList } = snapshot;

  const kpiTiles = [
    { label: 'Today',       value: kpi.todayCount,         color: 'text-emerald-300', sub: 'jobs' },
    { label: 'Week ahead',  value: kpi.weekAheadCount,     color: 'text-sky-300',     sub: 'plans' },
    { label: 'This month',  value: kpi.completedThisMonth, color: 'text-violet-300',  sub: 'completed' },
    { label: 'Ready',       value: kpi.readyCount,         color: 'text-green-300',   sub: 'branches' },
    { label: 'Not ready',   value: kpi.notReadyCount,      color: 'text-red-300',     sub: 'attention' },
    { label: 'Sensors',     value: kpi.totalSensors,       color: 'text-amber-300',   sub: 'cameras' },
    { label: 'All plans',   value: kpi.totalPlans,         color: 'text-zinc-300',    sub: 'records' },
  ];

  return (
    <div className="fixed inset-0 bg-zinc-950 text-zinc-100 overflow-hidden flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-2 border-b border-zinc-800 bg-zinc-900/60 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">🛰️</span>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">DITECH</div>
            <div className="text-sm font-semibold tracking-wider">Command Wall</div>
          </div>
          <span className="ml-2 text-[10px] text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/30">
            ● LIVE
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setSoundEnabled(s => !s)}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
            className="px-2 py-1 text-[10px] rounded border bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700">
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button onClick={() => fetchSnapshot()}
            className="px-2 py-1 text-[10px] rounded border bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700">
            ↻ Refresh
          </button>
          <button onClick={toggleFullscreen}
            className="px-2 py-1 text-[10px] rounded border bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700">
            ⛶ Fullscreen
          </button>
          <div className="text-right leading-tight ml-2">
            <div className="text-2xl font-mono font-semibold text-emerald-300">
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider">
              {now.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <div className={`w-2 h-2 rounded-full ${ssedConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
               title={ssedConnected ? 'Live SSE' : 'SSE offline'} />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: main grid */}
        <main className="flex-1 p-3 overflow-hidden flex flex-col gap-3">
          {/* Row 1: KPI tiles slim */}
          <section className="grid grid-cols-7 gap-2 flex-shrink-0">
            {kpiTiles.map((t) => (
              <div key={t.label}
                className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500">{t.label}</div>
                <div className={`text-2xl font-mono font-bold leading-tight ${t.color}`}>
                  {t.value.toLocaleString()}
                </div>
                <div className="text-[9px] text-zinc-600">{t.sub}</div>
              </div>
            ))}
          </section>

          {/* Row 2: Calendar + Day side-panel + Team workload */}
          <section className="grid gap-3 flex-shrink-0"
            style={{ height: '300px', gridTemplateColumns: selectedDate ? '1fr 360px 240px' : '1fr 240px' }}>

            {/* Calendar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-md p-3 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  📅 {monthCalendar.monthLabel}
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex bg-zinc-800 rounded p-0.5 gap-0.5">
                    {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
                      <button key={v}
                        onClick={() => setCalendarView(v)}
                        className={`px-2 py-0.5 text-[9px] uppercase tracking-wider rounded transition ${
                          calendarView === v
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-zinc-500">{monthCalendar.totalInMonth} this month</span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-0.5 mb-1 flex-shrink-0">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="text-center text-[9px] text-zinc-500 uppercase tracking-wider">{d}</div>
                ))}
              </div>

              <div className={`grid ${calendarView === 'day' ? 'grid-cols-1' : 'grid-cols-7'} gap-0.5 flex-1`}>
                {visibleCells.map((c) => {
                  const isSelected = c.date === selectedDate;
                  const dotClass = c.count >= 3 ? 'bg-red-400' : c.count >= 2 ? 'bg-amber-400' : 'bg-emerald-400';
                  return (
                    <button key={c.date}
                      onClick={() => setSelectedDate(isSelected ? null : c.date)}
                      className={`relative rounded p-1 border text-left transition ${
                        isSelected
                          ? 'bg-sky-500/20 border-sky-500/60 ring-1 ring-sky-500/40'
                          : c.isToday
                          ? 'bg-emerald-500/15 border-emerald-500/50'
                          : c.isCurrentMonth
                          ? 'bg-zinc-800/40 border-zinc-800 hover:bg-zinc-800/70'
                          : 'bg-zinc-900/40 border-zinc-900 hover:bg-zinc-800/30'
                      } ${calendarView === 'day' ? 'min-h-[200px]' : ''}`}>
                      <div className={`text-[10px] font-mono ${
                        isSelected ? 'text-sky-300 font-bold' :
                        c.isToday ? 'text-emerald-300 font-bold' :
                        c.isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600'
                      }`}>
                        {c.day}
                      </div>
                      {c.count > 0 && calendarView !== 'day' && (
                        <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5">
                          {Array.from({ length: Math.min(c.count, 3) }).map((_, i) => (
                            <div key={i} className={`w-1 h-1 rounded-full ${dotClass}`} />
                          ))}
                          <span className="text-[9px] font-bold font-mono text-zinc-200 ml-0.5">{c.count}</span>
                        </div>
                      )}
                      {/* Day-view inline plans */}
                      {calendarView === 'day' && c.plans.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {c.plans.map((p: any) => (
                            <div key={p.id} className="text-[10px] text-zinc-200 bg-zinc-800/60 rounded p-1.5">
                              <div className="font-semibold">{p.storeName}</div>
                              <div className="text-zinc-500 text-[9px]">{p.customer?.customerCode} · {p.team?.name || 'Unassigned'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Day side panel — only when selectedDate */}
            {selectedDate && (
              <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-md p-3 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-emerald-400">Selected day</div>
                    <div className="text-xs font-semibold text-emerald-200">
                      {formatDateLong(selectedDate)}
                    </div>
                  </div>
                  <button onClick={() => setSelectedDate(null)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5">✕</button>
                </div>

                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                  {!selectedDayPlans || selectedDayPlans.length === 0 ? (
                    <div className="text-zinc-600 italic text-xs text-center py-6">— ไม่มีงานในวันนี้ —</div>
                  ) : selectedDayPlans.map((p: any) => (
                    <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded p-2">
                      <div className="text-[9px] text-zinc-500">
                        {p.customer?.customerCode || '?'} · <span className={`px-1 rounded ${p.storeRegion === 'BANGKOK' ? 'text-sky-300' : 'text-amber-300'}`}>{p.storeRegion}</span>
                      </div>
                      <div className="text-sm text-zinc-100 font-semibold leading-tight mt-0.5">{p.storeName}</div>
                      {p.branchName && <div className="text-[10px] text-zinc-500">สาขา {p.branchName}</div>}

                      {/* Quick stats */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(p.workStartTime || p.workEndTime) && (
                          <span className="text-[9px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                            🕐 {p.workStartTime || '?'}{p.workEndTime ? `–${p.workEndTime}` : ''}
                          </span>
                        )}
                        <span className="text-[9px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                          📷 {p.sensorCount || 0} cams
                        </span>
                        <span className="text-[9px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                          👥 {p.team?.name || 'Unassigned'}
                        </span>
                      </div>

                      {/* Work scope chips */}
                      {p.workScope && p.workScope.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.workScope.map((s: string) => {
                            const info = WORK_SCOPE_INFO[s] || { label: s, icon: '•', color: 'bg-zinc-700 text-zinc-300' };
                            return (
                              <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded border ${info.color}`}>
                                {info.icon} {info.label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Status row */}
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded border ${statusChip(p.planStatus)}`}>
                          {p.planStatus}
                        </span>
                        <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded ${readinessChip(p.readiness)}`}>
                          {p.readiness}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team workload */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-md p-3 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">👥 Team load</div>
                <div className="text-[10px] text-zinc-500">7-day</div>
              </div>
              <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                {teams.sort((a, b) => b.weekLoad - a.weekLoad).map((t) => {
                  const max = Math.max(...teams.map(x => x.weekLoad), 1);
                  return (
                    <div key={t.id}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-zinc-200 truncate flex-1 min-w-0">{t.name}</span>
                        <span className="text-[10px] font-mono text-emerald-300 ml-2">{t.weekLoad}</span>
                      </div>
                      <div className="h-1 bg-zinc-800 rounded overflow-hidden flex">
                        {t.breakdown.completed > 0 && <div className="bg-emerald-500" style={{ width: `${(t.breakdown.completed / max) * 100}%` }} />}
                        {t.breakdown.inProgress > 0 && <div className="bg-sky-500" style={{ width: `${(t.breakdown.inProgress / max) * 100}%` }} />}
                        {t.breakdown.confirmed > 0 && <div className="bg-violet-500" style={{ width: `${(t.breakdown.confirmed / max) * 100}%` }} />}
                        {t.breakdown.draft > 0 && <div className="bg-zinc-600" style={{ width: `${(t.breakdown.draft / max) * 100}%` }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Row 3: Upcoming 30 days + recent activity */}
          <section className="grid grid-cols-12 gap-3 flex-1 overflow-hidden min-h-0">
            <div className="col-span-8 bg-zinc-900 border border-zinc-800 rounded-md p-3 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  📅 Upcoming installations · next 30 days
                </div>
                <div className="text-[10px] text-zinc-500">{upcoming30Days.length} plans</div>
              </div>

              <div className="overflow-y-auto flex-1 -mr-2 pr-2">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-zinc-900 z-10">
                    <tr className="text-[9px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                      <th className="text-left py-1.5 font-medium">Date</th>
                      <th className="text-left py-1.5 font-medium">Store</th>
                      <th className="text-left py-1.5 font-medium">Region</th>
                      <th className="text-center py-1.5 font-medium">Cams</th>
                      <th className="text-left py-1.5 font-medium">Work scope</th>
                      <th className="text-left py-1.5 font-medium">Team</th>
                      <th className="text-center py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming30Days.length === 0 ? (
                      <tr><td colSpan={7} className="text-zinc-600 italic text-center py-6">— No upcoming —</td></tr>
                    ) : upcoming30Days.map((p: any) => (
                      <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-1.5 text-zinc-300 font-mono whitespace-nowrap">{formatDate(p.scheduledDate)}</td>
                        <td className="py-1.5 max-w-[180px]">
                          <div className="text-zinc-200 truncate">{p.storeName}</div>
                          <div className="text-zinc-600 text-[9px]">{p.customer?.customerCode}</div>
                        </td>
                        <td className="py-1.5">
                          <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded ${
                            p.storeRegion === 'BANGKOK'
                              ? 'bg-sky-500/10 text-sky-300'
                              : 'bg-amber-500/10 text-amber-300'
                          }`}>{p.storeRegion}</span>
                        </td>
                        <td className="py-1.5 text-center">
                          <span className="text-zinc-300 font-mono font-bold">{p.sensorCount || 0}</span>
                        </td>
                        <td className="py-1.5">
                          {p.workScope && p.workScope.length > 0 ? (
                            <div className="flex flex-wrap gap-0.5">
                              {p.workScope.slice(0, 4).map((s: string) => {
                                const info = WORK_SCOPE_INFO[s] || { label: s, icon: '•' };
                                return (
                                  <span key={s} className="text-[8px] bg-zinc-800 text-zinc-300 px-1 py-0.5 rounded" title={info.label}>
                                    {info.icon}
                                  </span>
                                );
                              })}
                              {p.workScope.length > 4 && (
                                <span className="text-[8px] text-zinc-500">+{p.workScope.length - 4}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-600 text-[9px]">—</span>
                          )}
                        </td>
                        <td className="py-1.5 text-zinc-400 text-[10px]">{p.team?.name || <span className="text-amber-400/70">Unassigned</span>}</td>
                        <td className="py-1.5 text-center">
                          <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded border ${statusChip(p.planStatus)}`}>
                            {p.planStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent activity (enhanced) */}
            <div className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-md p-3 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">🔔 Activity</div>
                <div className="text-[10px] text-zinc-500">last {recentChanges.length}</div>
              </div>
              <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
                {recentChanges.length === 0 ? (
                  <div className="text-zinc-600 italic text-xs text-center py-6">— No activity —</div>
                ) : recentChanges.slice(0, 30).map((c: any) => {
                  const fieldLabel = FIELD_TH[c.fieldChanged] || c.fieldChanged;
                  return (
                    <div key={c.id} className="bg-zinc-800/40 border border-zinc-800 rounded px-2 py-1.5">
                      <div className="text-[10px] text-zinc-200 font-semibold truncate">
                        {c.plan?.storeName || '?'}
                      </div>
                      <div className="text-[9px] text-zinc-500">
                        {c.plan?.customer?.customerCode || ''} · {fieldLabel}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-[9px] flex items-center gap-1">
                          {c.oldValue && (
                            <>
                              <span className="text-zinc-500 line-through">{c.oldValue}</span>
                              <span className="text-zinc-600">→</span>
                            </>
                          )}
                          <span className="text-emerald-400 font-mono font-bold">{c.newValue}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-0.5 text-[9px] text-zinc-500">
                        <span>{c.changedBy?.fullName || 'system'}</span>
                        <span className="font-mono">{timeAgo(c.changedAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </main>

        {/* Right: Telegram feed (newest at bottom + sound + highlight) */}
        <aside className="w-[340px] border-l border-zinc-800 bg-zinc-950 flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span>📡</span>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-zinc-500">Telegram</div>
                <div className="text-xs font-semibold text-zinc-100">Realtime feed</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] text-emerald-400 uppercase">live</span>
            </div>
          </div>

          {/* Feed scroll — newest at bottom */}
          <div ref={feedScrollRef}
            className="flex-1 overflow-y-auto p-2 scroll-smooth flex flex-col-reverse"
            style={{ gap: '6px' }}>
            {telegramFeed.length === 0 ? (
              <div className="text-center text-zinc-600 italic py-12 text-xs">— No messages yet —</div>
            ) : [...telegramFeed].reverse().map((f, i) => {
              const isFailed = f.status === 'FAILED';
              const ruleName = f.ruleName || f.rule?.name || '?';
              const msgId = f.id || `${f.recipient}-${f.createdAt}-${i}`;
              const isNew = newMessageIds.has(msgId);
              return (
                <div key={msgId}
                  className={`rounded border p-2 transition-all duration-300 ${
                    isNew
                      ? 'bg-emerald-500/25 border-emerald-400 ring-2 ring-emerald-500/40 cc-glow'
                      : isFailed
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-emerald-500/5 border-emerald-500/20'
                  }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] ${isFailed ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isFailed ? '✗' : '✓'}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500">{ruleName}</span>
                      {isNew && (
                        <span className="text-[8px] uppercase tracking-wider px-1 bg-emerald-500/30 text-emerald-200 rounded animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-zinc-600 font-mono">{timeShort(f.createdAt)}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mb-0.5">→ {f.recipient}</div>
                  {isFailed ? (
                    <div className="text-[10px] text-red-300 font-mono bg-red-500/10 px-1.5 py-0.5 rounded">
                      {f.errorMessage || 'Failed'}
                    </div>
                  ) : (
                    <>
                      {f.photoUrl && (
                        <div className="mb-1 rounded overflow-hidden border border-zinc-800 bg-zinc-900">
                          <img
                            src={f.photoUrl}
                            alt="Uploaded photo"
                            className="w-full h-auto max-h-48 object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <div className="text-[10px] text-zinc-200 whitespace-pre-wrap leading-snug max-h-24 overflow-y-auto">
                        {f.body || ''}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-3 py-1.5 border-t border-zinc-800 bg-zinc-900/40 text-[9px] text-zinc-500 flex items-center justify-between flex-shrink-0">
            <span>{telegramFeed.length} messages · newest below</span>
            <span className="font-mono">{soundEnabled ? '🔊 ON' : '🔇 OFF'}</span>
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes cc-glow-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(52, 211, 153, 0.4); }
          50% { box-shadow: 0 0 16px rgba(52, 211, 153, 0.7); }
        }
        .cc-glow {
          animation: cc-glow-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
