import type { InstallationPlan } from '../api/types';

export function StatusPill({ plan, className = '' }: { plan: InstallationPlan; className?: string }) {
  let bg = 'bg-gray-100 text-gray-600', label: string = plan.readiness;
  if (plan.planStatus === 'COMPLETED') { bg = 'bg-emerald-100 text-emerald-800'; label = 'Completed'; }
  else if (plan.planStatus === 'CONFIRMED') { bg = 'bg-blue-100 text-blue-800'; label = 'Confirmed'; }
  else if (plan.planStatus === 'IN_PROGRESS') { bg = 'bg-purple-100 text-purple-800'; label = 'Installing'; }
  else if (plan.readiness === 'READY') { bg = 'bg-green-100 text-green-800'; label = 'Ready'; }
  else if (plan.readiness === 'NOT_READY') { bg = 'bg-amber-100 text-amber-800'; label = 'Not ready'; }

  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${bg} ${className}`}>{label}</span>;
}

export function chipClass(plan: InstallationPlan): string {
  if (plan.planStatus === 'COMPLETED') return 'bg-emerald-50 text-emerald-900 border border-emerald-200';
  if (plan.planStatus === 'CONFIRMED') return 'bg-blue-50 text-blue-900 border border-blue-200';
  if (plan.planStatus === 'IN_PROGRESS') return 'bg-purple-50 text-purple-900 border border-purple-200';
  if (plan.readiness === 'READY') return 'bg-green-50 text-green-900 border border-green-200';
  if (plan.readiness === 'NOT_READY') return 'bg-amber-50 text-amber-900 border border-amber-200';
  return 'bg-gray-50 text-gray-700 border border-gray-200';
}
