import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Page title block. Replaces the ad-hoc <h1>/<h2> each page grew on its own. */
export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-ink-primary">{title}</h1>
        {subtitle !== undefined && <p className="text-sm text-ink-secondary mt-0.5">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
