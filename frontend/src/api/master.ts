import { api } from './client';
import type { Customer, Department, Team } from './types';

// Helpers — backwards compat: support both `masterApi.customers()` (call) and `.customers.list()` (namespace)
function makeCrud<T>(prefix: string) {
  const list = (params?: { includeInactive?: boolean }) =>
    api.get<{ data: T[] }>(`/master/${prefix}`, { params }).then((r) => r.data.data);

  const create = (payload: any) =>
    api.post<{ data: T }>(`/master/${prefix}`, payload).then((r) => r.data.data);

  const update = (id: string, payload: any) =>
    api.patch<{ data: T }>(`/master/${prefix}/${id}`, payload).then((r) => r.data.data);

  const remove = (id: string) =>
    api.delete<{ message?: string; softDeleted?: boolean }>(`/master/${prefix}/${id}`).then((r) => r.data);

  // Allow `masterApi.customers()` to call list directly for backwards compat
  const fn = (() => list()) as any;
  fn.list = list;
  fn.create = create;
  fn.update = update;
  fn.delete = remove;
  return fn as ((() => Promise<T[]>) & {
    list: typeof list;
    create: typeof create;
    update: typeof update;
    delete: typeof remove;
  });
}

export const masterApi = {
  customers: makeCrud<Customer>('customers'),
  departments: makeCrud<Department>('departments'),
  teams: makeCrud<Team>('teams'),
};
