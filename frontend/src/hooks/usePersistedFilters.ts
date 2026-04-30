import { useState, useEffect, useCallback } from 'react';

/**
 * usePersistedFilters — keep filter/UI state in localStorage so users see
 * the same view when they refresh, navigate away and back, or reopen the app.
 *
 * Usage:
 *   const [filters, setFilters, resetFilters] = usePersistedFilters('plans-list', {
 *     search: '',
 *     customerId: '',
 *     planStatus: '',
 *   });
 *
 * Storage key is `ditech_filters_<key>` to avoid colliding with other localStorage entries.
 *
 * Notes:
 * - The hook merges saved values onto defaults, so adding new filter fields
 *   later won't break existing saved state.
 * - resetFilters() clears the saved state and returns to defaults.
 */
export function usePersistedFilters<T extends Record<string, any>>(
  key: string,
  defaults: T
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = `ditech_filters_${key}`;

  const [filters, setFiltersInternal] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return defaults;
      const parsed = JSON.parse(saved);
      // Merge so new default fields appear even on old saved states
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(filters));
    } catch {
      /* localStorage full or disabled — silently ignore */
    }
  }, [storageKey, filters]);

  // Wrap setter so consumers can pass a value or updater function
  const setFilters = useCallback((next: T | ((prev: T) => T)) => {
    setFiltersInternal((prev) => (typeof next === 'function' ? (next as any)(prev) : next));
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch { /* noop */ }
    setFiltersInternal(defaults);
  }, [storageKey, defaults]);

  return [filters, setFilters, reset];
}
