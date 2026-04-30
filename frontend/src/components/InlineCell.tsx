import { useState, useEffect, useRef } from 'react';

type Option = { value: string; label: string };

type Props = {
  value: any;
  display?: React.ReactNode;          // What's shown when not editing — defaults to value
  onSave: (newValue: any) => Promise<void> | void;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: Option[];                  // For select
  placeholder?: string;
  disabled?: boolean;
  className?: string;                  // Cell-level class
  inputClass?: string;
  validate?: (v: any) => string | null; // Return error message or null
  align?: 'left' | 'center' | 'right';
  parse?: (raw: string) => any;        // For converting input value to save value
};

export function InlineCell({
  value, display, onSave, type = 'text', options,
  placeholder, disabled, className = '', inputClass = '',
  validate, align = 'left', parse
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(formatForInput(value, type));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => { setDraft(formatForInput(value, type)); }, [value, type]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) (inputRef.current as HTMLInputElement).select?.();
    }
  }, [editing]);

  const commit = async () => {
    let parsed = parse ? parse(draft) : draft;
    if (type === 'number' && !parse) parsed = draft === '' ? null : Number(draft);
    if (type === 'date' && !parse) parsed = draft === '' ? null : draft; // YYYY-MM-DD

    // Skip save if unchanged
    const current = type === 'number' ? Number(value) : value;
    if (parsed === current || (parsed == null && current == null)) {
      setEditing(false);
      setError(null);
      return;
    }

    if (validate) {
      const err = validate(parsed);
      if (err) { setError(err); return; }
    }

    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
      setDraft(formatForInput(value, type));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(formatForInput(value, type));
    setEditing(false);
    setError(null);
  };

  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : '';
  const dispNode = display !== undefined ? display : (value ?? '—');

  if (disabled) {
    return <div className={`px-2 py-1.5 ${alignClass} ${className}`}>{dispNode}</div>;
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className={`px-2 py-1.5 cursor-pointer hover:bg-blue-50 rounded transition-colors ${alignClass} ${className} ${saving ? 'opacity-50' : ''}`}
        title="Click to edit"
      >
        {dispNode}
        {saving && <span className="ml-1 text-xs text-blue-500">⟳</span>}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {type === 'select' ? (
        <select
          ref={inputRef as any}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel();
            if (e.key === 'Enter') commit();
          }}
          disabled={saving}
          className={`w-full px-1.5 py-1 border-2 border-blue-400 rounded text-sm bg-white outline-none ${inputClass}`}
        >
          {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          ref={inputRef as any}
          type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel();
            if (e.key === 'Enter') commit();
          }}
          placeholder={placeholder}
          disabled={saving}
          className={`w-full px-1.5 py-1 border-2 border-blue-400 rounded text-sm bg-white outline-none ${alignClass} ${inputClass}`}
        />
      )}
      {error && (
        <div className="absolute left-0 top-full mt-0.5 z-30 bg-red-50 border border-red-300 text-red-700 text-[10px] px-2 py-0.5 rounded shadow whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}

function formatForInput(v: any, type: string): string {
  if (v == null) return '';
  if (type === 'date') {
    // Accept ISO string or "YYYY-MM-DD"
    if (typeof v === 'string') return v.length >= 10 ? v.substring(0, 10) : v;
    if (v instanceof Date) return v.toISOString().substring(0, 10);
  }
  return String(v);
}
