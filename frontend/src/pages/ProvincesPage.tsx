import { useQuery } from '@tanstack/react-query';
import { plansApi } from '../api/plans';

export function ProvincesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['plans-list', 'province-aggregation'],
    queryFn: () => plansApi.list({ limit: 1000, page: 1 }),
  });

  const aggregation: { region: string; province: string; count: number }[] = [];
  if (data?.data) {
    const map = new Map<string, { region: string; province: string; count: number }>();
    for (const p of data.data) {
      const region = p.storeRegion || '—';
      const province = p.province || '—';
      const key = `${region}|${province}`;
      if (!map.has(key)) map.set(key, { region, province, count: 0 });
      map.get(key)!.count++;
    }
    aggregation.push(...Array.from(map.values()).sort((a, b) =>
      a.region.localeCompare(b.region) || a.province.localeCompare(b.province)
    ));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium flex items-center gap-2">
          📍 Regions &amp; Provinces
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Read-only — derived from existing plans. The system uses 2 regions: <strong>BANGKOK</strong> and <strong>UPC</strong> (upcountry).
          Provinces are a free-text field on each plan.
        </p>
      </div>

      <div className="ditech-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : aggregation.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No plans yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Region</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Province</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">Plans</th>
                </tr>
              </thead>
              <tbody>
                {aggregation.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        row.region === 'BANGKOK' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {row.region}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.province}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
