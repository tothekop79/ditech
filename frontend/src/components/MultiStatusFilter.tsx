import React from 'react';

interface Props {
  values: string[];
  options: { value: string; label: string }[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:       'bg-gray-100 text-gray-700 border-gray-300',
  CONFIRMED:   'bg-purple-100 text-purple-700 border-purple-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-300',
  COMPLETED:   'bg-green-100 text-green-700 border-green-300',
  CANCELLED:   'bg-red-100 text-red-700 border-red-300',
};

/**
 * MultiStatusFilter — chip-style multi-select for plan statuses.
 * Click to toggle each status. The active set is what gets rendered.
 * Empty array = no statuses selected = nothing matches.
 */
export function MultiStatusFilter({ values, options, onChange }: Props) {
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };

  return (
    <div className="inline-flex flex-wrap gap-1 items-center px-1.5 py-1 border border-gray-300 rounded bg-white">
      {options.map((opt) => {
        const on = values.includes(opt.value);
        const colorClass = STATUS_COLORS[opt.value] || 'bg-gray-100 text-gray-700 border-gray-300';
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={`text-[10px] font-medium px-2 py-0.5 rounded border transition ${
              on ? colorClass : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
            }`}
            title={on ? `Click to hide ${opt.label}` : `Click to show ${opt.label}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
