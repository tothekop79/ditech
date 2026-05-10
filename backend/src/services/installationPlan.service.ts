import { Prisma, PlanReadiness, PlanStatus, StoreRegion } from '@prisma/client';
import { prisma } from '../config/db';
import { CreateInstallationPlanDTO, UpdateInstallationPlanDTO, InstallationPlanQuery, BulkImportRow } from '../types/installationPlan.types';
import { commandBus } from './eventBus.service';

export class InstallationPlanService {
  private include = {
    customer: { select: { id: true, customerCode: true, customerName: true, logoUrl: true } },
    department: { select: { id: true, departmentCode: true, departmentName: true } },
    team: { select: { id: true, name: true, region: true } },
    event: { select: { id: true, name: true, startDate: true, endDate: true, venue: true, organizer: true, profile: true, status: true } },
  };

  async create(data: CreateInstallationPlanDTO, createdById?: string) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) throw new Error('Customer not found');
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept) throw new Error('Department not found');

    const plan = await prisma.installationPlan.create({
      data: {
        ...data,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
        workScope: data.workScope || [],
        createdById,
      },
      include: this.include,
    });

    this.emitEvent('PLAN_CREATED', { plan });
    commandBus.emit('plan:created', { plan });
    return plan;
  }

  async getAll(query: InstallationPlanQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.InstallationPlanWhereInput = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.storeRegion) where.storeRegion = query.storeRegion;
    if (query.province) where.province = query.province;
    if (query.readiness) {
      const arr = String(query.readiness).split(",").filter(Boolean);
      where.readiness = arr.length > 1 ? { in: arr as any } : (arr[0] as any);
    }
    if (query.planStatus) {
      const arr = String(query.planStatus).split(",").filter(Boolean);
      where.planStatus = arr.length > 1 ? { in: arr as any } : (arr[0] as any);
    }
    if (query.teamId) where.teamId = query.teamId;
    if (query.search) {
      where.OR = [
        { storeName: { contains: query.search, mode: 'insensitive' } },
        { detail: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.scheduledFrom || query.scheduledTo) {
      where.scheduledDate = {};
      if (query.scheduledFrom) where.scheduledDate.gte = new Date(query.scheduledFrom);
      if (query.scheduledTo) where.scheduledDate.lte = new Date(query.scheduledTo);
    }

    const orderBy: Prisma.InstallationPlanOrderByWithRelationInput = query.sortBy
      ? { [query.sortBy]: query.sortOrder || 'asc' }
      : { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      prisma.installationPlan.findMany({ where, skip, take: limit, orderBy, include: this.include }),
      prisma.installationPlan.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const plan = await prisma.installationPlan.findUnique({
      where: { id },
      include: {
        ...this.include,
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          take: 20,
          include: { changedBy: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });
    if (!plan) throw new Error('Plan not found');
    return plan;
  }

  async update(id: string, data: UpdateInstallationPlanDTO, changedById?: string) {
    const existing = await prisma.installationPlan.findUnique({ where: { id } });
    if (!existing) throw new Error('Plan not found');

    const historyEntries: Prisma.PlanStatusHistoryCreateManyInput[] = [];
    if (data.readiness && data.readiness !== existing.readiness) {
      historyEntries.push({
        planId: id, fieldChanged: 'readiness',
        oldValue: existing.readiness, newValue: data.readiness,
        changedById, note: data.readinessNote,
      });
    }
    if (data.planStatus && data.planStatus !== existing.planStatus) {
      historyEntries.push({
        planId: id, fieldChanged: 'planStatus',
        oldValue: existing.planStatus, newValue: data.planStatus, changedById,
      });
    }

    const updateData: Prisma.InstallationPlanUpdateInput = {};
    Object.entries(data).forEach(([k, v]) => {
      if (v === undefined) return;
      if (k === 'scheduledDate' || k === 'completedDate') {
        (updateData as any)[k] = v ? new Date(v as any) : null;
      } else if (k === 'teamId') {
        updateData.team = v ? { connect: { id: v as string } } : { disconnect: true };
      } else {
        (updateData as any)[k] = v;
      }
    });

    const [plan] = await prisma.$transaction([
      prisma.installationPlan.update({ where: { id }, data: updateData, include: this.include }),
      ...(historyEntries.length ? [prisma.planStatusHistory.createMany({ data: historyEntries })] : []),
    ]);

    if (data.readiness === 'READY' && existing.readiness !== 'READY') {
      this.emitEvent('READINESS_READY', { plan });
    }
    if (data.planStatus === 'CONFIRMED' && existing.planStatus !== 'CONFIRMED') {
      this.emitEvent('STATUS_CHANGE', { plan, condition: 'CONFIRMED' });
    }
    if (data.planStatus === 'COMPLETED' && existing.planStatus !== 'COMPLETED') {
      this.emitEvent('STATUS_CHANGE', { plan, condition: 'COMPLETED' });
    }
    if (data.scheduledDate !== undefined) {
      const oldMs = existing.scheduledDate ? new Date(existing.scheduledDate).getTime() : null;
      const newMs = data.scheduledDate ? new Date(data.scheduledDate as any).getTime() : null;
      if (newMs !== null && oldMs !== newMs) {
        this.emitEvent('RESCHEDULED', {
          plan,
          oldDate: existing.scheduledDate,
          newDate: data.scheduledDate,
          isFirstTime: oldMs === null,
        });
      }
    }

    if (data.teamId !== undefined) {
      const oldTeamId = existing.teamId;
      const newTeamId = data.teamId;
      if (oldTeamId !== newTeamId) {
        const [oldTeam, newTeam] = await Promise.all([
          oldTeamId ? prisma.team.findUnique({ where: { id: oldTeamId }, select: { id: true, name: true, telegramChatId: true } }) : Promise.resolve(null),
          newTeamId ? prisma.team.findUnique({ where: { id: newTeamId }, select: { id: true, name: true, telegramChatId: true } }) : Promise.resolve(null),
        ]);
        this.emitEvent('TEAM_CHANGED', {
          plan,
          oldTeam,
          newTeam,
          isFirstAssign: oldTeamId === null && newTeamId !== null,
          isUnassigned: oldTeamId !== null && newTeamId === null,
        });
      }
    }

    commandBus.emit('plan:updated', { plan });
    return plan;
  }

  async reschedule(id: string, newDate: string, changedById?: string) {
    const plan = await prisma.installationPlan.findUnique({ where: { id } });
    if (!plan) throw new Error('Plan not found');

    const oldDate = plan.scheduledDate?.toISOString().split('T')[0];

    await prisma.$transaction([
      prisma.installationPlan.update({ where: { id }, data: { scheduledDate: new Date(newDate) } }),
      prisma.planStatusHistory.create({
        data: {
          planId: id, fieldChanged: 'scheduledDate',
          oldValue: oldDate || null, newValue: newDate,
          changedById, note: 'Rescheduled',
        },
      }),
    ]);

    return this.getById(id);
  }

  async delete(id: string) {
    await prisma.installationPlan.delete({ where: { id } });
    commandBus.emit('plan:deleted', { id });
    return { message: 'Plan deleted' };
  }

  async getStatistics(filters: { storeRegion?: StoreRegion; from?: Date; to?: Date }) {
    const where: Prisma.InstallationPlanWhereInput = {};
    if (filters.storeRegion) where.storeRegion = filters.storeRegion;
    if (filters.from || filters.to) {
      where.scheduledDate = {};
      if (filters.from) where.scheduledDate.gte = filters.from;
      if (filters.to) where.scheduledDate.lte = filters.to;
    }

    const [total, ready, notReady, completed, totalSensors] = await Promise.all([
      prisma.installationPlan.count({ where }),
      prisma.installationPlan.count({ where: { ...where, readiness: 'READY' } }),
      prisma.installationPlan.count({ where: { ...where, readiness: 'NOT_READY' } }),
      prisma.installationPlan.count({ where: { ...where, planStatus: 'COMPLETED' } }),
      prisma.installationPlan.aggregate({ where, _sum: { sensorCount: true } }),
    ]);

    return {
      total, ready, notReady, completed,
      totalSensors: totalSensors._sum.sensorCount || 0,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
    };
  }

  async validateImportRows(rows: BulkImportRow[], mode: 'create' | 'upsert' = 'create') {
    const customerCodes = [...new Set(rows.map(r => r.customerCode.toUpperCase()))];
    const deptCodes = [...new Set(rows.map(r => r.departmentCode.toUpperCase()))];

    const [customers, depts] = await Promise.all([
      prisma.customer.findMany({ where: { customerCode: { in: customerCodes } } }),
      prisma.department.findMany({ where: { departmentCode: { in: deptCodes } } }),
    ]);

    const custMap = new Map(customers.map(c => [c.customerCode, c.id]));
    const deptMap = new Map(depts.map(d => [d.departmentCode, d.id]));

    // For upsert mode, prefetch existing plans matching (customerId+departmentId+storeName)
    const existingMap = new Map<string, string>(); // key = `${cid}|${did}|${storeName.toLowerCase()}` → planId
    if (mode === 'upsert') {
      const allPlans = await prisma.installationPlan.findMany({
        select: { id: true, customerId: true, departmentId: true, storeName: true },
      });
      for (const p of allPlans) {
        existingMap.set(`${p.customerId}|${p.departmentId}|${(p.storeName || '').toLowerCase()}`, p.id);
      }
    }

    return rows.map((row, idx) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!custMap.has(row.customerCode.toUpperCase())) warnings.push(`Will auto-create customer: ${row.customerCode}`);
      if (!deptMap.has(row.departmentCode.toUpperCase())) warnings.push(`Will auto-create department: ${row.departmentCode}`);
      if (!row.storeName) errors.push('Missing store name');

      if (!row.sensorCount) warnings.push('No sensor count, defaulting to 0');
      if (row.readiness && !['PENDING', 'NOT_READY', 'READY', 'ON_HOLD'].includes(row.readiness)) {
        warnings.push('Unknown readiness, defaulting to PENDING');
      }

      // Decide action (create vs update)
      let action: 'create' | 'update' = 'create';
      let existingPlanId: string | null = null;
      if (mode === 'upsert' && row.storeName) {
        const cid = custMap.get(row.customerCode.toUpperCase());
        const did = deptMap.get(row.departmentCode.toUpperCase());
        if (cid && did) {
          const key = `${cid}|${did}|${row.storeName.toLowerCase()}`;
          const found = existingMap.get(key);
          if (found) {
            action = 'update';
            existingPlanId = found;
          }
        }
      }

      return {
        row: idx + 1, data: row,
        status: errors.length ? 'error' : warnings.length ? 'warn' : 'ok',
        message: errors.join('; ') || warnings.join('; '),
        action,
        existingPlanId,
      };
    });
  }


  async bulkImport(rows: BulkImportRow[], createdById?: string, mode: 'create' | 'upsert' = 'create') {
    // Auto-create any missing customers and departments
    const allCustCodes = Array.from(new Set(rows.map(r => r.customerCode?.toUpperCase()).filter(Boolean)));
    const allDeptCodes = Array.from(new Set(rows.map(r => r.departmentCode?.toUpperCase()).filter(Boolean)));

    const existingCusts = await prisma.customer.findMany({ where: { customerCode: { in: allCustCodes } } });
    const existingCustCodes = new Set(existingCusts.map(c => c.customerCode));
    for (const code of allCustCodes) {
      if (!existingCustCodes.has(code)) {
        try { await prisma.customer.create({ data: { customerCode: code, customerName: code, isActive: true } }); }
        catch (e) { /* race condition */ }
      }
    }

    const existingDepts = await prisma.department.findMany({ where: { departmentCode: { in: allDeptCodes } } });
    const existingDeptCodes = new Set(existingDepts.map(d => d.departmentCode));
    for (const code of allDeptCodes) {
      if (!existingDeptCodes.has(code)) {
        try { await prisma.department.create({ data: { departmentCode: code, departmentName: code, isActive: true } }); }
        catch (e) { /* race condition */ }
      }
    }

    const validated = await this.validateImportRows(rows, mode);
    const valid = validated.filter(v => v.status !== 'error');

    const customers = await prisma.customer.findMany();
    const depts = await prisma.department.findMany();
    const custMap = new Map(customers.map(c => [c.customerCode, c.id]));
    const deptMap = new Map(depts.map(d => [d.departmentCode, d.id]));

    let created = 0;
    let updated = 0;
    for (const v of valid) {
      const r = v.data;
      const customerId = custMap.get(r.customerCode.toUpperCase())!;
      const departmentId = deptMap.get(r.departmentCode.toUpperCase())!;

      const planData: any = {
        storeName: r.storeName,
        branchName: (r as any).branchName ?? null,
        storeRegion: (r.storeRegion as StoreRegion) || 'BANGKOK',
        province: r.province,
        address: (r as any).address,
        contactPerson: (r as any).contactPerson,
        contactPhone: (r as any).contactPhone,
        description: r.description || 'install Cam',
        sensorCount: r.sensorCount || 0,
        readiness: (r.readiness as PlanReadiness) || 'PENDING',
        planStatus: ((r as any).planStatus as any) || 'DRAFT',
        detail: r.detail,
        scheduledDate: r.scheduledDate ? new Date(r.scheduledDate) : null,
      };

      try {
        if (v.action === 'update' && v.existingPlanId) {
          await prisma.installationPlan.update({
            where: { id: v.existingPlanId },
            data: planData,
          });
          updated++;
        } else {
          await prisma.installationPlan.create({
            data: { ...planData, customerId, departmentId, createdById },
          });
          created++;
        }
      } catch (e) {
        v.status = 'error';
        v.message = e instanceof Error ? e.message : 'Unknown error';
      }
    }

    return { created, updated, total: created + updated, errors: validated.filter(v => v.status === 'error').length, validated };
  }

  private emitEvent(trigger: string, payload: any) {
    import('../queues/notification.queue').then(({ enqueueByTrigger }) => {
      enqueueByTrigger(trigger, payload).catch(err => console.error('Notify enqueue failed:', err));
    }).catch(() => {});
  }

  async linkToEvent(planId: string, eventId: string, inheritFields = true, changedById?: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { customer: { select: { id: true } } },
    });
    if (!event) throw new Error('Event not found');

    const plan = await prisma.installationPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Plan not found');

    const updateData: any = { eventId };

    if (inheritFields) {
      // Inherit dates: scheduledDate ← event.startDate, durationDays ← span
      updateData.scheduledDate = event.startDate;
      const spanMs = event.endDate.getTime() - event.startDate.getTime();
      updateData.durationDays = Math.max(1, Math.round(spanMs / 86400000) + 1);

      // Inherit venue / contact / customer
      if (event.venue) updateData.address = event.venue;
      if (event.organizer) updateData.contactPerson = event.organizer;
      if (event.customer?.id) updateData.customerId = event.customer.id;

      // Description: keep existing if non-empty, else use event name
      if (!plan.description || plan.description.trim() === '') {
        updateData.description = event.name;
      }
    }

    const updated = await prisma.installationPlan.update({
      where: { id: planId },
      data: updateData,
      include: {
        event: { select: { id: true, name: true, startDate: true, endDate: true, venue: true, organizer: true } },
      },
    });

    // Status history entry
    if (changedById) {
      // Look up old event name if there was one
      let oldName: string | null = null;
      if (plan.eventId) {
        const oldEvent = await prisma.event.findUnique({
          where: { id: plan.eventId },
          select: { name: true },
        });
        oldName = oldEvent?.name ?? null;
      }
      await prisma.planStatusHistory.create({
        data: {
          planId,
          fieldChanged: 'event',
          oldValue: oldName,
          newValue: event.name,
          changedById,
          note: inheritFields ? 'Linked with field inheritance' : 'Linked to event',
        },
      });
    }
    return updated;
  }

  async unlinkFromEvent(planId: string, changedById?: string) {
    const plan = await prisma.installationPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Plan not found');
    if (!plan.eventId) throw new Error('Plan is not linked to any event');

    const updated = await prisma.installationPlan.update({
      where: { id: planId },
      data: { eventId: null },
    });

    if (changedById) {
      // Look up old event name
      const oldEvent = plan.eventId ? await prisma.event.findUnique({
        where: { id: plan.eventId },
        select: { name: true },
      }) : null;
      await prisma.planStatusHistory.create({
        data: {
          planId,
          fieldChanged: 'event',
          oldValue: oldEvent?.name ?? null,
          newValue: '',
          changedById,
          note: 'Unlinked from event',
        },
      });
    }
    return updated;
  }
}

export const installationPlanService = new InstallationPlanService();
