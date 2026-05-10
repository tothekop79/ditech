import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { commandCenterApi, type CCSnapshot } from '../api/commandCenter';

const REFRESH_INTERVAL_MS = 30_000;

// Work scope label + icon mapping (light theme — soft pastels)
const WORK_SCOPE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  INSTALL_CAMERA: { label: 'Camera',     icon: '📷', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  INSTALL_LAN:    { label: 'LAN',        icon: '🔌', color: 'bg-green-50 text-green-700 border-green-200' },
  INSTALL_POE:    { label: 'POE',        icon: '⚡', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  CALIBRATION:    { label: 'Calibrate',  icon: '🎯', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  TESTING:        { label: 'Test',       icon: '✓',  color: 'bg-slate-50 text-slate-700 border-slate-200' },
  CLOUD_SETUP:    { label: 'Cloud',      icon: '☁️', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  MAINTENANCE:    { label: 'Maintenance',icon: '🔧', color: 'bg-orange-50 text-orange-700 border-orange-200' },
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

// Status pill — light theme (soft pastel)
const statusChip = (s: string) => {
  if (s === 'COMPLETED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'IN_PROGRESS') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s === 'CONFIRMED') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (s === 'CANCELLED') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

// Readiness pill — light theme
const readinessChip = (r: string) => {
  if (r === 'READY') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (r === 'NOT_READY') return 'bg-red-50 text-red-700 border-red-200';
  if (r === 'ON_HOLD') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
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

  // K5: Font scale (persisted in localStorage) — for 65" TV viewing
  const [fontScale, setFontScale] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem('wall-font-scale') || '1');
      return isNaN(v) ? 1 : Math.min(2.5, Math.max(0.75, v));
    } catch { return 1; }
  });
  useEffect(() => { try { localStorage.setItem('wall-font-scale', String(fontScale)); } catch {/**/} }, [fontScale]);
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
        // Mark as new for highlight
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

  // Calendar derived: filtered cells based on view
  const visibleCells = useMemo(() => {
    if (!snapshot) return [];
    const cells = snapshot.monthCalendar.cells;
    if (calendarView === 'month') return cells;
    if (calendarView === 'week') {
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
      <div className="fixed inset-x-0 bottom-0 top-[52px] bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (error || !snapshot) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-[52px] bg-slate-50 flex items-center justify-center">
        <div className="bg-white border border-red-200 rounded-lg px-6 py-4 shadow-card">
          <div className="text-red-600 font-medium">⚠ {error || 'Snapshot unavailable'}</div>
        </div>
      </div>
    );
  }

  const { kpi, monthCalendar, upcoming30Days, teams, recentChanges } = snapshot;

  // KPI tiles — light theme color-coded by meaning
  const kpiTiles = [
    { label: 'Today',       value: kpi.todayCount,         color: 'text-blue-600',          hover: 'hover:border-blue-300',    sub: 'jobs',      icon: '📅' },
    { label: 'Week ahead',  value: kpi.weekAheadCount,     color: 'text-sky-600',           hover: 'hover:border-sky-300',     sub: 'plans',     icon: '📊' },
    { label: 'This month',  value: kpi.completedThisMonth, color: 'text-violet-600',        hover: 'hover:border-violet-300',  sub: 'completed', icon: '✓' },
    { label: 'Ready',       value: kpi.readyCount,         color: 'text-emerald-600',       hover: 'hover:border-emerald-300', sub: 'branches',  icon: '🟢' },
    { label: 'Not ready',   value: kpi.notReadyCount,      color: 'text-red-600',           hover: 'hover:border-red-300',     sub: 'attention', icon: '⚠' },
    { label: 'Sensors',     value: kpi.totalSensors,       color: 'text-amber-600',         hover: 'hover:border-amber-300',   sub: 'cameras',   icon: '📷' },
    { label: 'All plans',   value: kpi.totalPlans,         color: 'text-ditech-primary',    hover: 'hover:border-ditech-primary', sub: 'records', icon: '📁' },
  ];

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[52px] bg-slate-50 text-slate-900 flex flex-col overflow-hidden"
      style={{ zoom: fontScale } as React.CSSProperties}
    >
      {/* ─────── Top bar ─────── */}
      <header className="flex items-center justify-between px-5 py-2 border-b border-slate-200 bg-white shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">🛰️</span>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">DITECH</div>
            <div className="text-sm font-semibold tracking-wider text-slate-900">Command Wall</div>
          </div>
          <span className="ml-2 text-[10px] text-emerald-700 px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-200 font-medium inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* K5: Font scale */}
          <div className="inline-flex items-center bg-white border border-slate-300 rounded shadow-sm">
            <button onClick={() => setFontScale(s => Math.max(0.75, parseFloat((s - 0.1).toFixed(2))))}
              title="Smaller"
              className="px-2.5 py-1 text-[11px] hover:bg-slate-50 rounded-l border-r border-slate-200">A−</button>
            <span className="px-2 text-[11px] font-mono text-slate-600 min-w-[40px] text-center">
              {Math.round(fontScale * 100)}%
            </span>
            <button onClick={() => setFontScale(s => Math.min(2.5, parseFloat((s + 0.1).toFixed(2))))}
              title="Larger"
              className="px-2.5 py-1 text-[11px] hover:bg-slate-50 rounded-r border-l border-slate-200">A+</button>
          </div>

          {/* K5: 65" TV preset */}
          <button onClick={() => setFontScale(1.5)}
            title="65 inch TV preset (150%)"
            className="px-2.5 py-1 text-[11px] rounded border bg-white text-slate-700 border-slate-300 shadow-sm hover:bg-slate-50">
            📺 65"
          </button>

          <button onClick={() => setSoundEnabled(s => !s)}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
            className="px-2.5 py-1 text-[11px] rounded border bg-white text-slate-700 border-slate-300 shadow-sm hover:bg-slate-50">
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button onClick={() => fetchSnapshot()}
            className="px-2.5 py-1 text-[11px] rounded border bg-white text-slate-700 border-slate-300 shadow-sm hover:bg-slate-50">
            ↻ Refresh
          </button>
          <button onClick={toggleFullscreen}
            className="px-2.5 py-1 text-[11px] rounded border bg-white text-slate-700 border-slate-300 shadow-sm hover:bg-slate-50">
            ⛶ Fullscreen
          </button>
          <div className="text-right leading-tight ml-2">
            <div className="text-2xl font-mono font-semibold text-slate-900">
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">
              {now.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <div className={`w-2 h-2 rounded-full ${ssedConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
               title={ssedConnected ? 'Live SSE' : 'SSE offline'} />
        </div>
      </header>

      {/* ─────── Body: main + Telegram sidebar ─────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: main content */}
        <main className="flex-1 p-3 overflow-hidden flex flex-col gap-3">

          {/* Row 1: KPI tiles */}
          <section className="grid grid-cols-7 gap-2 flex-shrink-0">
            {kpiTiles.map((t) => (
              <div key={t.label}
                className={`bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-sm transition-all ${t.hover} hover:shadow-md`}>
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </div>
                <div className={`text-2xl font-bold leading-tight ${t.color}`}>
                  {t.value.toLocaleString()}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">{t.sub}</div>
              </div>
            ))}
          </section>

          {/* Row 2: Calendar + Day side-panel + Team workload */}
          <section className="grid gap-3 flex-shrink-0"
            style={{ height: '300px', gridTemplateColumns: selectedDate ? '1fr 260px 240px' : '1fr 240px' }}>

            {/* Calendar */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 overflow-hidden flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="text-[11px] uppercase tracking-wider text-slate-700 font-semibold flex items-center gap-1.5">
                  <span>📅</span>
                  <span>{monthCalendar.monthLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex bg-slate-100 rounded p-0.5 gap-0.5">
                    {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
                      <button key={v}
                        onClick={() => setCalendarView(v)}
                        className={`px-2 py-0.5 text-[9px] uppercase tracking-wider rounded font-semibold transition ${
                          calendarView === v
                            ? 'bg-white text-ditech-primary shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500">{monthCalendar.totalInMonth} this month</span>
                </div>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1 flex-shrink-0">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="text-center text-[9px] text-slate-500 uppercase tracking-wider font-semibold">{d}</div>
                ))}
              </div>

              {/* Calendar grid — with cell borders */}
              <div className={`grid ${calendarView === 'day' ? 'grid-cols-1' : 'grid-cols-7'} gap-1 flex-1`}>
                {visibleCells.map((c) => {
                  const isSelected = c.date === selectedDate;
                  const dotClass = c.count >= 3 ? 'bg-red-500' : c.count >= 2 ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <button key={c.date}
                      onClick={() => setSelectedDate(isSelected ? null : c.date)}
                      className={`relative rounded-md p-1 border text-left transition shadow-sm ${
                        isSelected
                          ? 'bg-blue-50 border-2 border-blue-500 ring-1 ring-blue-200'
                          : c.isToday
                          ? 'bg-emerald-50 border-2 border-emerald-400'
                          : c.isCurrentMonth
                          ? 'bg-white border-slate-200 hover:bg-slate-50 hover:border-blue-300'
                          : 'bg-slate-50 border-slate-100 text-slate-400'
                      } ${calendarView === 'day' ? 'min-h-[200px]' : ''}`}>
                      <div className={`text-[10px] font-mono ${
                        isSelected ? 'text-blue-700 font-bold' :
                        c.isToday ? 'text-emerald-700 font-bold' :
                        c.isCurrentMonth ? 'text-slate-700' : 'text-slate-400'
                      }`}>
                        {c.day}
                      </div>
                      {c.count > 0 && calendarView !== 'day' && (
                        <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5">
                          {Array.from({ length: Math.min(c.count, 3) }).map((_, i) => (
                            <div key={i} className={`w-1 h-1 rounded-full ${dotClass}`} />
                          ))}
                          <span className="text-[9px] font-bold font-mono text-slate-700 ml-0.5">{c.count}</span>
                        </div>
                      )}
                      {/* Day-view inline plans */}
                      {calendarView === 'day' && c.plans.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {c.plans.map((p: any) => (
                            <div key={p.id} className="text-[10px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-1.5">
                              <div className="font-semibold">{p.storeName}</div>
                              <div className="text-slate-500 text-[9px]">{p.customer?.customerCode} · {p.team?.name || 'Unassigned'}</div>
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
              <div className="bg-white border border-slate-200 rounded-lg p-3 overflow-hidden flex flex-col shadow-sm">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Selected day</div>
                    <div className="text-xs font-semibold text-ditech-primary">
                      {formatDateLong(selectedDate)}
                    </div>
                  </div>
                  <button onClick={() => setSelectedDate(null)}
                    className="text-[12px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5">✕</button>
                </div>

                <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
                  {!selectedDayPlans || selectedDayPlans.length === 0 ? (
                    <div className="text-slate-400 italic text-xs text-center py-6">— ไม่มีงานในวันนี้ —</div>
                  ) : selectedDayPlans.map((p: any) => (
                    <div key={p.id} className="bg-white border border-slate-200 rounded-md p-2 hover:border-blue-300 hover:bg-blue-50/30 transition cursor-pointer">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[8px] uppercase tracking-wider font-semibold text-slate-600">
                          {p.customer?.customerCode || '?'}
                        </span>
                        <span className={`text-[8px] px-1 py-0 rounded border ${
                          p.storeRegion === 'BANGKOK'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>{p.storeRegion}</span>
                        <span className={`text-[8px] uppercase px-1 py-0 rounded-full border font-medium ml-auto ${statusChip(p.planStatus)}`}>
                          {p.planStatus}
                        </span>
                      </div>
                      <div className="text-xs text-slate-900 font-semibold leading-tight">{p.storeName}</div>
                      {p.branchName && <div className="text-[9px] text-slate-500">สาขา {p.branchName}</div>}

                      {/* Quick stats — compact inline */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[9px] text-slate-600">
                        {(p.workStartTime || p.workEndTime) && (
                          <span>🕐 {p.workStartTime || '?'}{p.workEndTime ? `–${p.workEndTime}` : ''}</span>
                        )}
                        <span>📷 {p.sensorCount || 0}</span>
                        <span className="truncate">👥 {p.team?.name || 'Unassigned'}</span>
                      </div>

                      {/* Work scope chips — compact, icon-only */}
                      {p.workScope && p.workScope.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {p.workScope.slice(0, 5).map((s: string) => {
                            const info = WORK_SCOPE_INFO[s] || { label: s, icon: '•', color: 'bg-slate-50 text-slate-700 border-slate-200' };
                            return (
                              <span key={s} className={`text-[9px] px-1 py-0 rounded border ${info.color}`} title={info.label}>
                                {info.icon}
                              </span>
                            );
                          })}
                          {p.workScope.length > 5 && (
                            <span className="text-[8px] text-slate-500">+{p.workScope.length - 5}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team workload — with grid lines on bars */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 overflow-hidden flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="text-[11px] uppercase tracking-wider text-slate-700 font-semibold flex items-center gap-1.5">
                  <span>👥</span><span>Team load</span>
                </div>
                <div className="text-[10px] text-slate-500">7-day</div>
              </div>
              <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                {teams.sort((a, b) => b.weekLoad - a.weekLoad).map((t) => {
                  const max = Math.max(...teams.map(x => x.weekLoad), 1);
                  return (
                    <div key={t.id}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-slate-700 font-medium truncate flex-1 min-w-0">{t.name}</span>
                        <span className="text-[10px] font-mono text-slate-900 font-semibold ml-2">{t.weekLoad}</span>
                      </div>
                      {/* Grid-lined progress bar */}
                      <div className="relative h-2 rounded-full overflow-hidden border border-slate-200"
                        style={{
                          backgroundImage: 'linear-gradient(to right, transparent 0, transparent calc(25% - 1px), #cbd5e1 calc(25% - 1px), #cbd5e1 25%, transparent 25%, transparent calc(50% - 1px), #cbd5e1 calc(50% - 1px), #cbd5e1 50%, transparent 50%, transparent calc(75% - 1px), #cbd5e1 calc(75% - 1px), #cbd5e1 75%, transparent 75%)',
                          backgroundColor: '#f1f5f9'
                        }}>
                        <div className="h-full flex">
                          {t.breakdown.completed > 0 && <div className="bg-emerald-500" style={{ width: `${(t.breakdown.completed / max) * 100}%` }} />}
                          {t.breakdown.inProgress > 0 && <div className="bg-blue-500" style={{ width: `${(t.breakdown.inProgress / max) * 100}%` }} />}
                          {t.breakdown.confirmed > 0 && <div className="bg-violet-500" style={{ width: `${(t.breakdown.confirmed / max) * 100}%` }} />}
                          {t.breakdown.draft > 0 && <div className="bg-slate-400" style={{ width: `${(t.breakdown.draft / max) * 100}%` }} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* Scale legend */}
                <div className="flex justify-between text-[9px] text-slate-400 pt-2 mt-1 border-t border-slate-200 font-mono">
                  <span>0</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
              </div>
            </div>
          </section>

          {/* Row 3: Upcoming 30 days + recent activity */}
          <section className="grid grid-cols-12 gap-3 flex-1 overflow-hidden min-h-0">

            {/* Upcoming Installations */}
            <div className="col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col shadow-sm">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 flex-shrink-0">
                <div className="text-[11px] uppercase tracking-wider text-slate-700 font-semibold flex items-center gap-1.5">
                  <span>📅</span><span>Upcoming installations · next 30 days</span>
                </div>
                <div className="text-[10px] text-slate-500">{upcoming30Days.length} plans</div>
              </div>

              <div className="overflow-y-auto flex-1">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="text-[9px] uppercase tracking-wider text-slate-600 border-b border-slate-200">
                      <th className="text-left px-3 py-2 font-semibold">Date</th>
                      <th className="text-left px-3 py-2 font-semibold">Store</th>
                      <th className="text-left px-3 py-2 font-semibold">Region</th>
                      <th className="text-center px-3 py-2 font-semibold">Cams</th>
                      <th className="text-left px-3 py-2 font-semibold">Work scope</th>
                      <th className="text-left px-3 py-2 font-semibold">Team</th>
                      <th className="text-center px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {upcoming30Days.length === 0 ? (
                      <tr><td colSpan={7} className="text-slate-400 italic text-center py-6">— No upcoming —</td></tr>
                    ) : upcoming30Days.map((p: any) => (
                      <tr key={p.id} className="hover:bg-blue-50/30 transition">
                        <td className="px-3 py-2 text-slate-600 font-mono whitespace-nowrap">{formatDate(p.scheduledDate)}</td>
                        <td className="px-3 py-2 max-w-[180px]">
                          <div className="text-slate-900 font-medium truncate">{p.storeName}</div>
                          <div className="text-slate-500 text-[9px]">{p.customer?.customerCode}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded border font-medium ${
                            p.storeRegion === 'BANGKOK'
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>{p.storeRegion}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-slate-900 font-mono font-bold">{p.sensorCount || 0}</span>
                        </td>
                        <td className="px-3 py-2">
                          {p.workScope && p.workScope.length > 0 ? (
                            <div className="flex flex-wrap gap-0.5">
                              {p.workScope.slice(0, 4).map((s: string) => {
                                const info = WORK_SCOPE_INFO[s] || { label: s, icon: '•' };
                                return (
                                  <span key={s} className="text-[10px] bg-slate-100 text-slate-700 px-1 py-0.5 rounded border border-slate-200" title={info.label}>
                                    {info.icon}
                                  </span>
                                );
                              })}
                              {p.workScope.length > 4 && (
                                <span className="text-[8px] text-slate-500">+{p.workScope.length - 4}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[9px]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700 text-[10px]">{p.team?.name || <span className="text-amber-600 italic">Unassigned</span>}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded-full border font-medium ${statusChip(p.planStatus)}`}>
                            {p.planStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent activity — full borders, color-coded */}
            <div className="col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col shadow-sm">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 flex-shrink-0">
                <div className="text-[11px] uppercase tracking-wider text-slate-700 font-semibold flex items-center gap-1.5">
                  <span>🔔</span><span>Activity</span>
                </div>
                <div className="text-[10px] text-slate-500">last {recentChanges.length}</div>
              </div>
              <div className="overflow-y-auto flex-1 space-y-1.5 px-2 py-2">
                {recentChanges.length === 0 ? (
                  <div className="text-slate-400 italic text-xs text-center py-6">— No activity —</div>
                ) : recentChanges.slice(0, 30).map((c: any) => {
                  const fieldLabel = FIELD_TH[c.fieldChanged] || c.fieldChanged;
                  // Color-code activity item by field type
                  const colorClass =
                    c.fieldChanged === 'planStatus' ? 'border-amber-200 bg-amber-50/40' :
                    c.fieldChanged === 'readiness' ? 'border-emerald-200 bg-emerald-50/40' :
                    c.fieldChanged === 'teamId' ? 'border-violet-200 bg-violet-50/40' :
                    c.fieldChanged === 'event' || c.fieldChanged === 'eventId' ? 'border-blue-200 bg-blue-50/40' :
                    'border-slate-200 bg-slate-50/40';
                  return (
                    <div key={c.id} className={`border rounded-md px-2.5 py-1.5 hover:shadow-sm transition ${colorClass}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="text-[10px] text-slate-900 font-semibold truncate flex-1 min-w-0">
                          {c.plan?.storeName || '?'}
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono ml-2 flex-shrink-0">{timeAgo(c.changedAt)}</span>
                      </div>
                      <div className="text-[9px] text-slate-500">
                        {c.plan?.customer?.customerCode || ''} · {fieldLabel}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[9px]">
                        {c.oldValue && (
                          <>
                            <span className="text-slate-400 line-through">{c.oldValue}</span>
                            <span className="text-slate-400">→</span>
                          </>
                        )}
                        <span className="px-1.5 py-0 rounded bg-white border border-slate-200 text-slate-900 font-mono font-bold">{c.newValue}</span>
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        {c.changedBy?.fullName || 'system'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </main>

        {/* ─────── Right: Telegram sidebar ─────── */}
        <aside className="w-[340px] border-l border-slate-200 bg-white flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span>📡</span>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Telegram</div>
                <div className="text-xs font-semibold text-slate-900">Realtime feed</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] text-emerald-700 uppercase font-semibold">live</span>
            </div>
          </div>

          {/* Feed scroll — newest at bottom */}
          <div ref={feedScrollRef}
            className="flex-1 overflow-y-auto p-2 scroll-smooth flex flex-col-reverse"
            style={{ gap: '6px' }}>
            {telegramFeed.length === 0 ? (
              <div className="text-center text-slate-400 italic py-12 text-xs">— No messages yet —</div>
            ) : [...telegramFeed].reverse().map((f, i) => {
              const isFailed = f.status === 'FAILED';
              const ruleName = f.ruleName || f.rule?.name || '?';
              const msgId = f.id || `${f.recipient}-${f.createdAt}-${i}`;
              const isNew = newMessageIds.has(msgId);
              // Color-code: event report = blue, failed = red, normal = emerald
              const isEventReport = ruleName.toLowerCase().includes('event report');
              return (
                <div key={msgId}
                  className={`rounded-md border p-2 transition-all duration-300 ${
                    isNew
                      ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300 cc-glow'
                      : isFailed
                      ? 'bg-red-50/60 border-red-200'
                      : isEventReport
                      ? 'bg-blue-50/60 border-blue-200'
                      : 'bg-emerald-50/40 border-emerald-200'
                  }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-bold ${isFailed ? 'text-red-600' : isEventReport ? 'text-blue-700' : 'text-emerald-700'}`}>
                        {isFailed ? '✗' : isEventReport ? '📊' : '✓'}
                      </span>
                      <span className={`text-[9px] uppercase tracking-wider font-semibold ${isFailed ? 'text-red-700' : isEventReport ? 'text-blue-700' : 'text-emerald-700'}`}>{ruleName}</span>
                      {isNew && (
                        <span className="text-[8px] uppercase tracking-wider px-1 bg-emerald-500 text-white rounded animate-pulse font-semibold">
                          NEW
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono">{timeShort(f.createdAt)}</span>
                  </div>
                  <div className="text-[10px] text-slate-600 mb-0.5">→ {f.recipient}</div>
                  {isFailed ? (
                    <div className="text-[10px] text-red-700 font-mono bg-red-100/60 border border-red-200 px-1.5 py-0.5 rounded">
                      {f.errorMessage || 'Failed'}
                    </div>
                  ) : (
                    <>
                      {f.photoUrl && (
                        <div className="mb-1 rounded overflow-hidden border border-slate-200 bg-slate-50">
                          <img
                            src={f.photoUrl}
                            alt="Uploaded photo"
                            className="w-full h-auto max-h-48 object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <div className="text-[10px] text-slate-800 whitespace-pre-wrap leading-snug max-h-24 overflow-y-auto">
                        {f.body || ''}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 text-[9px] text-slate-500 flex items-center justify-between flex-shrink-0">
            <span>{telegramFeed.length} messages · newest below</span>
            <span className="font-mono">{soundEnabled ? '🔊 ON' : '🔇 OFF'}</span>
          </div>
        </aside>
      </div>

      {/* NEW message glow animation */}
      <style>{`
        @keyframes cc-glow-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(16, 185, 129, 0.4); }
          50% { box-shadow: 0 0 16px rgba(16, 185, 129, 0.7); }
        }
        .cc-glow {
          animation: cc-glow-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
