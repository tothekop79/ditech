import { MasterDataPage } from '../components/MasterDataPage';
import { masterApi } from '../api/master';

const DEPT_TYPES = [
  { value: 'DEPARTMENT_STORE', label: 'Department store' },
  { value: 'IT_MALL', label: 'IT mall' },
  { value: 'OTHER', label: 'Other' },
];

export function CustomersPage() {
  return (
    <MasterDataPage
      title="Customers"
      icon="🏢"
      description="Top-level customers (e.g. XIAOMI, Robinson, KingPower)"
      apiNs={masterApi.customers}
      queryKey="master-customers"
      columns={[
        { key: 'customerCode', label: 'Code', width: '120px' },
        { key: 'customerName', label: 'Name' },
        { key: 'contactPerson', label: 'Contact' },
        { key: 'contactPhone', label: 'Phone', width: '140px' },
        { key: '_count.installationPlans', label: 'Plans', width: '80px' },
        { key: 'isActive', label: 'Active', width: '70px',
          render: (v) => v ? <span className="text-green-600">●</span> : <span className="text-gray-400">○</span> },
      ]}
      formFields={[
        { key: 'customerCode', label: 'Customer code', required: true, uppercase: true,
          hint: 'Short code (uppercase, no spaces) — e.g. XIAOMI' },
        { key: 'customerName', label: 'Display name', required: true,
          hint: 'Full readable name' },
        { key: 'contactPerson', label: 'Contact person' },
        { key: 'contactPhone', label: 'Contact phone', type: 'tel' },
        { key: 'contactEmail', label: 'Contact email', type: 'email' },
        { key: 'logoUrl', label: 'Logo URL', type: 'url',
          hint: 'Optional — full URL to a logo image' },
      ]}
    />
  );
}
