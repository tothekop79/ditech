import type { ReactNode } from 'react';

export interface KpiDelta {
  value: number;
  suffix?: string;
}

export interface KpiCardProps {
  label: ReactNode;
  value: string | number;
  /** > 0 renders ▲ green, < 0 renders ▼ red, exactly 0 renders nothing */
  delta?: KpiDelta;
  hint?: ReactNode;
  tone?: 'default' | 'positive' | 'negative';
  className?: string;
}

const VALUE_TONE = {
  default: 'text-ditech-navy',
  positive: 'text-positive',
  negative: 'text-negative',
} as const;

export default function KpiCard({
  label,
  value,
  delta,
  hint,
  tone = 'default',
  className,
}: KpiCardProps) {
  const showDelta = delta !== undefined && delta.value !== 0;
  const up = showDelta && delta.value > 0;

  return (
    <div
      className={`bg-surface-card border border-surface-border rounded-xl shadow-ditech-card px-4 py-3.5${
        className ? ` ${className}` : ''
      }`}
    >
      <div className="text-xs text-ink-secondary">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${VALUE_TONE[tone]}`}>{value}</div>
      {showDelta && (
        <div className={`text-xs mt-0.5 tabular-nums ${up ? 'text-positive' : 'text-negative'}`}>
          {up ? '▲' : '▼'} {Math.abs(delta.value)}
          {delta.suffix ? ` ${delta.suffix}` : ''}
        </div>
      )}
      {!showDelta && hint !== undefined && <div className="text-xs text-ink-muted mt-0.5">{hint}</div>}
    </div>
  );
}
