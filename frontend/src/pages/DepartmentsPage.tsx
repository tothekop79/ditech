import { MasterDataPage } from '../components/MasterDataPage';
import { masterApi } from '../api/master';

const DEPT_TYPES = [
  { value: 'DEPARTMENT_STORE', label: 'Department store' },
  { value: 'IT_MALL', label: 'IT mall' },
  { value: 'OTHER', label: 'Other' },
];

const DEPT_TYPE_LABEL: Record<string, string> = {
  DEPARTMENT_STORE: '🏬 Dept store',
  IT_MALL: '💻 IT mall',
  OTHER: '📦 Other',
};

export function DepartmentsPage() {
  return (
    <MasterDataPage
      title="Departments"
      icon="🏬"
      description="Sub-brands or store types (Robinson, IT Mall, Central, etc.)"
      apiNs={masterApi.departments}
      queryKey="master-departments"
      columns={[
        { key: 'departmentCode', label: 'Code', width: '140px' },
        { key: 'departmentName', label: 'Name' },
        { key: 'departmentType', label: 'Type', width: '140px',
          render: (v) => DEPT_TYPE_LABEL[v] || v },
        { key: '_count.installationPlans', label: 'Plans', width: '80px' },
        { key: 'isActive', label: 'Active', width: '70px',
          render: (v) => v ? <span className="text-green-600">●</span> : <span className="text-gray-400">○</span> },
      ]}
      formFields={[
        { key: 'departmentCode', label: 'Department code', required: true, uppercase: true,
          hint: 'Short code (uppercase) — e.g. ROBINSON, IT_MALL' },
        { key: 'departmentName', label: 'Display name', required: true },
        { key: 'departmentType', label: 'Type', type: 'select', options: DEPT_TYPES,
          hint: 'Default: Department store' },
      ]}
    />
  );
}
