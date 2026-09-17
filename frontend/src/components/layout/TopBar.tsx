import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/useAuth';
import { PRIMARY_NAV, MORE_NAV, MORE_ITEMS, type NavItem } from './navConfig';

/* ------------------------------------------------------------------ icons */

type IconProps = { size?: number; className?: string };

const SearchIcon = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={2.2} className={className} aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);

const ChevronIcon = ({ size = 12, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={2.4} className={className} aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const BellIcon = ({ size = 17, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={2} className={className} aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
);

const MenuIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={2.2} className={className} aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

/* ------------------------------------------------------------- shared bits */

/** Every focusable control in the bar gets the same gold ring. */
const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ditech-gold';

const FOCUS_INSET =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-ditech-gold';

const MENU =
  'absolute top-[56px] z-50 bg-surface-card text-ink-primary border border-surface-border ' +
  'rounded-[10px] shadow-lg min-w-[220px] p-1.5 max-h-[calc(100vh-76px)] overflow-y-auto';

const MENU_ITEM =
  'flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[13.5px] hover:bg-surface-page ' +
  FOCUS_INSET;

/* ------------------------------------------------------------------ hooks */

/**
 * Close on outside click, on Esc, and on route change.
 * Uses 'click' (not 'mousedown') so the trigger's own onClick toggles first —
 * same ordering the previous Layout relied on.
 */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement>) {
  const loc = useLocation();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);

  // route change
  useEffect(() => { close(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Ticking wall clock, 1s. */
function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString('en-GB');
}

/** Subscribe to a slice of the TanStack cache without ever issuing a request. */
function useCacheValue<T>(read: () => T): T {
  const qc = useQueryClient();
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    setValue(read());
    return qc.getQueryCache().subscribe(() => setValue(read()));
  }, [qc, read]);
  return value;
}

/**
 * Backend reachability, derived from state the app already holds: the browser's
 * own online flag plus any *currently observed* query sitting in `error`.
 * There is no /health endpoint and no health store in this app (the old LIVE pill
 * was a hard-coded decoration), so this is the honest signal available without
 * adding a request.
 */
function useBackendOnline(): boolean {
  const qc = useQueryClient();
  const read = useCallback((): boolean => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    return !qc.getQueryCache().getAll()
      .some((q) => q.state.status === 'error' && q.getObserversCount() > 0);
  }, [qc]);
  return useCacheValue(read);
}

/* ------------------------------------------------------------------ helpers */

/** Router's own matcher — same rule NavLink applies, so the two never disagree. */
const isActive = (pathname: string, to: string) => matchPath({ path: to, end: false }, pathname) !== null;

function initials(user: { fullName?: string; email?: string } | null): string {
  const name = user?.fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name[0].toUpperCase();
  }
  return (user?.email?.[0] ?? '?').toUpperCase();
}

/* ------------------------------------------------------------------ TopBar */

export default function TopBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [moreOpen, setMoreOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const moreRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useDismiss(moreOpen, useCallback(() => setMoreOpen(false), []), moreRef);
  useDismiss(userOpen, useCallback(() => setUserOpen(false), []), userRef);
  useDismiss(drawerOpen, useCallback(() => setDrawerOpen(false), []), drawerRef);

  const clock = useClock();
  const online = useBackendOnline();
  const moreActive = MORE_ITEMS.some((i) => isActive(loc.pathname, i.to));

  /* Global search: jump to Plans and focus its search box. No command palette yet. */
  const focusPlansSearch = useCallback(() => {
    const focus = () => {
      const el = document.querySelector<HTMLInputElement>('[data-app-search]');
      el?.focus();
      el?.select();
    };
    if (loc.pathname.startsWith('/plans')) focus();
    else { nav('/plans'); window.setTimeout(focus, 120); }
  }, [loc.pathname, nav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusPlansSearch();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focusPlansSearch]);

  /* Environment / version rows — rendered only when the build actually defines them. */
  const env = import.meta.env as Record<string, string | undefined>;
  const appEnv = env.VITE_APP_ENV;
  const appHost = env.VITE_APP_HOST;
  const appVersion = env.VITE_APP_VERSION;
  const gitSha = env.VITE_GIT_SHA;

  const navLinkClass = ({ isActive: active }: { isActive: boolean }) =>
    [
      'relative flex items-center px-3 text-[13.5px] rounded-t-lg transition-colors whitespace-nowrap',
      active ? 'text-white font-semibold' : 'text-white/[.72] font-medium hover:text-white hover:bg-white/[.06]',
      FOCUS,
    ].join(' ');

  return (
    <header className="sticky top-0 z-30 h-[60px] bg-ditech-navy border-b border-white/[.08] text-white
                       flex items-center gap-2 px-5 relative whitespace-nowrap">
      {/* 1 · brand — logo carries the wordmark, so no DITECH text here */}
      <Link
        to="/"
        className={`flex shrink-0 items-center gap-2.5 h-9 pr-[18px] mr-1.5 xl:border-r border-white/[.08] rounded ${FOCUS}`}
      >
        <img src="/brand/logo_ditech_white.png" alt="DITECH" className="h-6 w-auto block" />
        <span className="hidden sm:block pl-2.5 border-l border-white/[.08] leading-[1.05]">
          <span className="block text-[11.5px] font-medium text-white/[.72] tracking-[.01em]">
            Installation Planner
          </span>
        </span>
      </Link>

      {/* 2 · primary nav */}
      <nav aria-label="หลัก" className="hidden xl:flex shrink-0 items-stretch h-[60px] gap-0.5">
        {PRIMARY_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={navLinkClass}>
            {({ isActive: active }) => (
              <>
                <span>{n.label}</span>
                {active && (
                  <span aria-hidden="true"
                        className="absolute left-3 right-3 bottom-0 h-0.5 rounded-t-sm bg-ditech-gold" />
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* More ▾ */}
        <div className="relative flex items-stretch" ref={moreRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={(e) => { e.stopPropagation(); setMoreOpen((v) => !v); }}
            className={[
              'relative flex items-center gap-1 px-3 text-[13.5px] rounded-t-lg transition-colors',
              moreActive || moreOpen
                ? 'text-white font-semibold bg-white/[.08]'
                : 'text-white/[.72] font-medium hover:text-white hover:bg-white/[.06]',
              FOCUS,
            ].join(' ')}
          >
            More
            <ChevronIcon className={`opacity-70 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            {moreActive && (
              <span aria-hidden="true"
                    className="absolute left-3 right-3 bottom-0 h-0.5 rounded-t-sm bg-ditech-gold" />
            )}
          </button>

          {moreOpen && (
            <div role="menu" className={`${MENU} left-0 min-w-[240px]`}>
              {MORE_NAV.map((g, gi) => (
                <div key={g.group}>
                  {gi > 0 && <hr className="my-1.5 border-surface-border" />}
                  <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] text-ink-muted">{g.group}</div>
                  {g.items.map((item) => (
                    <MenuLink key={item.to} item={item} onNavigate={() => setMoreOpen(false)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* 3 · spacer */}
      <div className="flex-1" />

      {/* 4–7 · right cluster */}
      <div className="flex min-w-0 items-center gap-2">
        {/* 4 · global search */}
        <button
          type="button"
          onClick={focusPlansSearch}
          className={`hidden min-[1400px]:flex min-w-[200px] shrink basis-[230px] overflow-hidden items-center gap-2
                      h-[34px] px-2.5 rounded-lg border border-white/[.14] bg-white/[.05]
                      text-white/60 text-[13px] hover:border-white/[.28] transition-colors ${FOCUS}`}
        >
          <SearchIcon className="shrink-0" />
          <span className="min-w-0 truncate">ค้นหาสาขา, ลูกค้า, แผน…</span>
          <kbd className="ml-auto shrink-0 px-1.5 text-[11px] font-sans border border-white/[.18] rounded-[5px] text-white/55">
            ⌘K
          </kbd>
        </button>

        {/* 5 · live + clock */}
        <div
          className="flex shrink-0 items-center gap-[7px] h-[34px] px-2.5 rounded-lg border border-white/[.14]
                     text-[12.5px] tabular-nums"
          title={online ? 'เชื่อมต่อ backend ปกติ' : 'ติดต่อ backend ไม่ได้'}
        >
          <span className={online ? 'live-dot' : 'live-dot-off'} aria-hidden="true" />
          <span className="text-white/80 font-semibold tracking-[.04em]">{online ? 'LIVE' : 'OFFLINE'}</span>
          <span className="hidden lg:block w-px h-3.5 bg-white/[.18]" aria-hidden="true" />
          <span className="hidden lg:block text-white/65">{clock}</span>
        </div>

        {/* 6 · notifications — no unread store exists yet, so no badge is rendered */}
        <button type="button" aria-label="การแจ้งเตือน"
                onClick={() => nav('/notify')}
                className={`w-[34px] h-[34px] shrink-0 rounded-lg grid place-items-center text-white/75
                            hover:bg-white/[.08] hover:text-white transition-colors relative ${FOCUS}`}>
          <BellIcon />
        </button>

        {/* 7 · user menu */}
        <div className="relative shrink-0" ref={userRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={userOpen}
            onClick={(e) => { e.stopPropagation(); setUserOpen((v) => !v); }}
            className={`flex items-center gap-[9px] h-9 pl-1 pr-1.5 rounded-[9px] ml-0.5
                        hover:bg-white/[.08] transition-colors ${userOpen ? 'bg-white/[.1]' : ''} ${FOCUS}`}
          >
            <span className="w-7 h-7 rounded-[7px] bg-gradient-to-br from-[#3D5384] to-[#2C4170]
                             grid place-items-center text-[11.5px] font-bold">
              {initials(user)}
            </span>
            <span className="hidden 2xl:block text-left leading-[1.1]">
              <span className="block text-[12.5px] font-semibold">{user?.fullName || 'User'}</span>
              <span className="block text-[10.5px] text-white/55">{user?.role}</span>
            </span>
            <ChevronIcon size={14} className={`hidden 2xl:block opacity-60 transition-transform ${userOpen ? 'rotate-180' : ''}`} />
          </button>

          {userOpen && (
            <div role="menu" className={`${MENU} right-0 min-w-[250px]`}>
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <span className="w-7 h-7 rounded-[7px] bg-ditech-navy text-white grid place-items-center
                                 text-[11.5px] font-bold">
                  {initials(user)}
                </span>
                <span>
                  <span className="block text-[13px] font-semibold">{user?.fullName}</span>
                  <span className="block text-[11.5px] text-ink-secondary">{user?.email}</span>
                </span>
              </div>
              <hr className="my-1.5 border-surface-border" />
              <MenuLink item={{ to: '/users', label: 'โปรไฟล์ของฉัน' }} onNavigate={() => setUserOpen(false)} />
              <MenuLink item={{ to: '/notify', label: 'ตั้งค่าการแจ้งเตือน', hint: 'Telegram' }}
                        onNavigate={() => setUserOpen(false)} />
              <MenuLink item={{ to: '/capacity', label: 'Settings' }} onNavigate={() => setUserOpen(false)} />
              {(appEnv || appVersion) && <hr className="my-1.5 border-surface-border" />}
              {appEnv && (
                <div className="flex items-center justify-between px-2.5 py-2 text-[12.5px] text-ink-secondary">
                  Environment
                  <em className="not-italic font-mono text-[11.5px] text-ink-primary">
                    {appHost ? `${appEnv} · ${appHost}` : appEnv}
                  </em>
                </div>
              )}
              {appVersion && (
                <div className="flex items-center justify-between px-2.5 py-2 text-[12.5px] text-ink-secondary">
                  Version
                  <em className="not-italic font-mono text-[11.5px] text-ink-primary">
                    {gitSha ? `${appVersion} · ${gitSha}` : appVersion}
                  </em>
                </div>
              )}
              <hr className="my-1.5 border-surface-border" />
              <button type="button"
                      onClick={() => { setUserOpen(false); logout(); }}
                      className={`${MENU_ITEM} w-full text-negative`}>
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>

        {/* hamburger — below lg the whole nav collapses in here */}
        <div className="relative xl:hidden" ref={drawerRef}>
          <button type="button" aria-label="เมนู" aria-haspopup="menu" aria-expanded={drawerOpen}
                  onClick={(e) => { e.stopPropagation(); setDrawerOpen((v) => !v); }}
                  className={`w-[34px] h-[34px] rounded-lg grid place-items-center text-white/75
                              hover:bg-white/[.08] hover:text-white transition-colors ${FOCUS}`}>
            <MenuIcon />
          </button>

          {drawerOpen && (
            <div role="menu"
                 className={`${MENU} right-0 min-w-[260px]`}>
              <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] text-ink-muted">หลัก</div>
              {PRIMARY_NAV.map((item) => (
                <MenuLink key={item.to} item={item} onNavigate={() => setDrawerOpen(false)} />
              ))}
              {MORE_NAV.map((g) => (
                <div key={g.group}>
                  <hr className="my-1.5 border-surface-border" />
                  <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] text-ink-muted">{g.group}</div>
                  {g.items.map((item) => (
                    <MenuLink key={item.to} item={item} onNavigate={() => setDrawerOpen(false)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------- menu link */

function MenuLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive: active }) =>
        `${MENU_ITEM} ${active ? 'bg-surface-page font-medium' : ''}`
      }
    >
      <span>{item.label}</span>
      {item.hint && <small className="ml-auto text-[11px] text-ink-muted">{item.hint}</small>}
    </NavLink>
  );
}
