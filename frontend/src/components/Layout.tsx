import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../features/auth/useAuth';

// Primary navigation (always visible)
const PRIMARY_NAV = [
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/plans', label: 'Plans', icon: '📋' },
  { to: '/events', label: 'Events', icon: '📊' },
  { to: '/gantt', label: 'Gantt', icon: '📊' },
  { to: '/map', label: 'Map', icon: '🗺️' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/command-center', label: 'Command', icon: '🛰️' },
  { to: '/command-wall', label: 'Wall', icon: '📺' },
];

// Settings menu (grouped under one dropdown)
const SETTINGS_NAV = [
  { group: 'Operations', items: [
    { to: '/capacity', label: 'Capacity', icon: '⚖️' },
    { to: '/alerts', label: 'Alerts', icon: '🚨' },
    { to: '/notify', label: 'Notification rules', icon: '🔔' },
  ]},
  { group: 'People', items: [
    { to: '/users', label: 'Users', icon: '👥' },
    { to: '/teams', label: 'Teams', icon: '🛠️' },
  ]},
  { group: 'Master data', items: [
    { to: '/customers', label: 'Customers', icon: '🏢' },
    { to: '/departments', label: 'Departments', icon: '🏬' },
    { to: '/provinces', label: 'Provinces', icon: '📍' },
  ]},
  { group: 'Data', items: [
    { to: '/import', label: 'Import / Export', icon: '⬆️' },
  ]},
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const settingsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Close dropdowns on outside click
  // Use 'click' (not 'mousedown') so button onClick handlers run first to toggle
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setSettingsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };
    // Use click + capture: false so it runs after onClick handlers
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const isSettingsActive = SETTINGS_NAV.some(g =>
    g.items.some(i => loc.pathname.startsWith(i.to))
  );

  const userInitial = user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';

  return (
    <div className="min-h-screen flex flex-col bg-ditech-bg">
      <header className="bg-ditech-primary text-white sticky top-0 z-30 shadow-header">
        <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 flex-shrink-0">
            <div className="relative">
              <div className="bg-white text-ditech-primary px-3 py-1.5 font-bold tracking-wider text-sm rounded">
                DITECH
              </div>
              <div className="absolute -top-1 -right-2 bg-ditech-accent text-ditech-primary text-[8px] font-bold px-1 rounded-sm">
                TM
              </div>
            </div>
            <div className="hidden md:block">
              <div className="text-sm font-semibold leading-tight">Installation Planner</div>
              <div className="text-[10px] opacity-70 leading-tight">DITECH Field Operations</div>
            </div>
          </Link>

          {/* Primary nav */}
          <nav className="flex items-center gap-0.5 flex-1 justify-center">
            {PRIMARY_NAV.map((n) => {
              const active = loc.pathname === n.to || loc.pathname.startsWith(n.to + '/');
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    active ? 'bg-ditech-secondary text-white' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <span className="text-base">{n.icon}</span>
                  <span className="hidden lg:inline">{n.label}</span>
                </Link>
              );
            })}

            {/* Settings dropdown */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setSettingsOpen(!settingsOpen); }}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  isSettingsActive ? 'bg-ditech-secondary text-white' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <span className="text-base">⚙️</span>
                <span className="hidden lg:inline">Settings</span>
                <span className="text-xs">{settingsOpen ? '▴' : '▾'}</span>
              </button>
              {settingsOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white text-ditech-text rounded-lg shadow-xl border border-ditech-border w-64 py-1.5 z-50">
                  {SETTINGS_NAV.map((group) => (
                    <div key={group.group} className="py-1">
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ditech-text-subtle font-semibold">
                        {group.group}
                      </div>
                      {group.items.map((item) => {
                        const active = loc.pathname === item.to || loc.pathname.startsWith(item.to + '/');
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setSettingsOpen(false)}
                            className={`flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-ditech-surface-alt ${
                              active ? 'bg-ditech-surface-alt text-ditech-secondary font-medium' : ''
                            }`}
                          >
                            <span className="text-base">{item.icon}</span>
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Right cluster: live pill, time, user */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="live-pill hidden md:inline-flex">LIVE</span>
            <span className="text-sm font-mono opacity-80 hidden lg:inline">
              {now.toLocaleTimeString('en-GB')}
            </span>

            {/* User dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setUserMenuOpen(!userMenuOpen); }}
                className="flex items-center gap-2 hover:bg-white/10 px-2 py-1 rounded-md transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ditech-accent to-ditech-accent-dark text-ditech-primary flex items-center justify-center text-sm font-bold">
                  {userInitial}
                </div>
                <div className="text-left hidden md:block">
                  <div className="text-xs font-medium leading-tight">{user?.fullName || 'User'}</div>
                  <div className="text-[10px] opacity-70 leading-tight">{user?.role}</div>
                </div>
              </button>
              {userMenuOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white text-ditech-text rounded-lg shadow-xl border border-ditech-border w-48 py-1.5 z-50">
                  <div className="px-3 py-2 border-b border-ditech-border">
                    <div className="text-sm font-medium">{user?.fullName}</div>
                    <div className="text-xs text-ditech-text-muted">{user?.email}</div>
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-ditech-surface-alt text-ditech-danger"
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 lg:px-6 py-5 max-w-[1600px] w-full mx-auto">
        {children}
      </main>

      <footer className="border-t border-ditech-border py-3 px-6 text-xs text-ditech-text-muted bg-white">
        <div className="flex items-center justify-between">
          <span>DITECH Installation Planner · v1.0</span>
          <span>© Digital Intelligence Technology Co., Ltd.</span>
        </div>
      </footer>
    </div>
  );
}
