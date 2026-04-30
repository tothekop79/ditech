import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { plansApi } from '../api/plans';
import { FilterBar, FilterValues } from '../components/FilterBar';
import { Spinner } from '../components/Spinner';
import { StatusPill } from '../components/StatusPill';

export function MapPage() {
  const [filters, setFilters] = useState<FilterValues>({});
  const { data, isLoading } = useQuery({
    queryKey: ['plans-all', JSON.stringify(filters)],
    queryFn: () => plansApi.list({ limit: 500, ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)) }),
  });
  const plans = data?.data || [];
  const provinceOptions = Array.from(new Set(plans.map((p: any) => p.province).filter(Boolean))).sort() as string[];
  const byProvince = plans.reduce((acc: any, p: any) => {
    const k = p.province || 'Unknown';
    if (!acc[k]) acc[k] = [];
    acc[k].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Geographic distribution</h2>
        <span className="text-xs text-gray-500">{plans.length} plans · {Object.keys(byProvince).length} provinces</span>
      </div>

      <FilterBar values={filters} onChange={setFilters}
        fields={['search', 'customer', 'department', 'region', 'province', 'team', 'status']}
        provinceOptions={provinceOptions} />

      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
        <strong>Map placeholder</strong> — Google Maps integration requires API key + billing setup.
        See <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">docs/SETUP.md</code> for instructions.
        Below shows province-grouped list view.
      </div>

      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(byProvince).sort(([, a]: any, [, b]: any) => b.length - a.length).map(([prov, ps]: any) => (
              <div key={prov} className="border border-gray-200 rounded p-3">
                <div className="flex justify-between items-center mb-2">
                  <strong className="text-sm">{prov}</strong>
                  <span className="text-xs text-gray-500">{ps.length} plan{ps.length > 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-1">
                  {ps.map((p: any) => (
                    <div key={p.id} className="flex justify-between items-center text-xs gap-2">
                      <span className="truncate flex-1" title={p.storeName}>{p.storeName}</span>
                      <StatusPill plan={p} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
