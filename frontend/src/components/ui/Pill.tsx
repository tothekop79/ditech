import type { ReactNode } from 'react';

export type PillTone = 'success' | 'warning' | 'neutral' | 'info' | 'danger';

export interface PillProps {
  tone: PillTone;
  children: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Status / region / filter chip. Tone carries colour AND the caller always passes
 * text, so the meaning survives a black-and-white print — colour is never the only cue.
 */
const TONE: Record<PillTone, string> = {
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  neutral: 'bg-slate-100 text-slate-600',
  info: 'bg-blue-50 text-blue-700',
  danger: 'bg-red-50 text-red-700',
};

const SIZE = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-0.5 text-xs',
} as const;

export default function Pill({ tone, children, size = 'md', className }: PillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${TONE[tone]} ${
        SIZE[size]
      }${className ? ` ${className}` : ''}`}
    >
      {children}
    </span>
  );
}
