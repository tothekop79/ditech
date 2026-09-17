import type { ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** rendered on the right of the header row */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Standard surface: white, hairline border, soft 1px shadow, 20px padding. */
export default function Card({ title, subtitle, action, children, className }: CardProps) {
  const hasHeader = title !== undefined || subtitle !== undefined || action !== undefined;

  return (
    <div
      className={`bg-surface-card border border-surface-border rounded-xl shadow-ditech-card p-5${
        className ? ` ${className}` : ''
      }`}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {title !== undefined && (
              <h3 className="text-sm font-semibold text-ink-primary truncate">{title}</h3>
            )}
            {subtitle !== undefined && (
              <p className="text-xs text-ink-secondary mt-0.5">{subtitle}</p>
            )}
          </div>
          {action !== undefined && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
