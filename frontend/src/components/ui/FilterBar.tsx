import type { ReactNode } from 'react';

export interface FilterBarProps {
  children: ReactNode;
  /** when given, renders a "ล้างตัวกรอง" link on the right */
  onReset?: () => void;
  className?: string;
}

/**
 * Wrapping container for a row of filters. Inputs and selects inside get their
 * look from the `.ui-input` class declared in index.css, so callers only pass
 * plain <input>/<select> with className="ui-input".
 */
export default function FilterBar({ children, onReset, className }: FilterBarProps) {
  return (
    <div
      className={`bg-surface-card border border-surface-border rounded-xl px-3 py-2.5
                  flex items-center gap-2 flex-wrap${className ? ` ${className}` : ''}`}
    >
      {children}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto text-sm text-ink-secondary hover:text-ink-primary underline-offset-2
                     hover:underline focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-ditech-gold rounded"
        >
          ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}
