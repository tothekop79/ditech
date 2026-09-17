import TopBar from './layout/TopBar';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface-page">
      <TopBar />

      <main className="flex-1 px-4 lg:px-6 py-5 max-w-[1600px] w-full mx-auto">
        {children}
      </main>

      <footer className="border-t border-surface-border py-3 px-6 text-xs text-ink-secondary bg-surface-card">
        <div className="flex items-center justify-between">
          <span>DITECH Installation Planner · v1.0</span>
          <span>© Digital Intelligence Technology Co., Ltd.</span>
        </div>
      </footer>
    </div>
  );
}
