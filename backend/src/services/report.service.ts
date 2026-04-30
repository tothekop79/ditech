import { prisma } from '../config/db';

export class ReportService {
  // ──────────────────────────────────────────────────────────────
  // Existing methods — kept for backward compatibility (export, etc.)
  // ──────────────────────────────────────────────────────────────
  async getWeeklySummary(weekStart: Date) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return this.summaryForRange(weekStart, weekEnd, 'weekly');
  }

  async getMonthlySummary(year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0); end.setHours(23, 59, 59, 999);
    return this.summaryForRange(start, end, 'monthly');
  }

  async summaryForRange(from: Date, to: Date, type: string) {
    const plans = await prisma.installationPlan.findMany({
      where: { scheduledDate: { gte: from, lte: to } },
      include: { customer: true, department: true, team: true },
      orderBy: { scheduledDate: 'asc' },
    });

    const completed = plans.filter(p => p.planStatus === 'COMPLETED').length;
    const total = plans.length;
    const totalSensors = plans.reduce((s, p) => s + p.sensorCount, 0);
    const completedSensors = plans.filter(p => p.planStatus === 'COMPLETED').reduce((s, p) => s + p.sensorCount, 0);

    const byCustomer: Record<string, any> = {};
    const byTeam: Record<string, any> = {};
    plans.forEach(p => {
      const c = p.customer.customerCode;
      if (!byCustomer[c]) byCustomer[c] = { code: c, name: p.customer.customerName, total: 0, completed: 0, sensors: 0 };
      byCustomer[c].total++;
      byCustomer[c].sensors += p.sensorCount;
      if (p.planStatus === 'COMPLETED') byCustomer[c].completed++;

      if (p.team) {
        const t = p.team.name;
        if (!byTeam[t]) byTeam[t] = { name: t, region: p.team.region, total: 0, completed: 0, sensors: 0 };
        byTeam[t].total++;
        byTeam[t].sensors += p.sensorCount;
        if (p.planStatus === 'COMPLETED') byTeam[t].completed++;
      }
    });

    return {
      type, range: { from, to },
      stats: {
        total, completed,
        ready: plans.filter(p => p.readiness === 'READY' && p.planStatus !== 'COMPLETED').length,
        notReady: plans.filter(p => p.readiness === 'NOT_READY').length,
        totalSensors, completedSensors,
        completionRate: total ? Math.round((completed / total) * 100) : 0,
      },
      byCustomer: Object.values(byCustomer),
      byTeam: Object.values(byTeam),
      plans,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // NEW: Dashboard endpoint — flexible filters + multi-metric
  // ──────────────────────────────────────────────────────────────
  async getDashboard(opts: {
    from?: Date;
    to?: Date;
    region?: string;       // 'BANGKOK' | 'UPC'
    customerId?: string;
  }) {
    const where: any = {};

    // Default range: last 90 days if none specified
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(now.getDate() - 90);
    const from = opts.from ?? defaultFrom;
    const to = opts.to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // end of current month

    // Filter by createdAt OR scheduledDate (whichever exists) — use both as union
    // For simplicity here, we filter by createdAt range for "all plans created in window"
    // and also expose scheduled-in-window via separate query
    where.createdAt = { gte: from, lte: to };
    if (opts.region) where.storeRegion = opts.region;
    if (opts.customerId) where.customerId = opts.customerId;

    const plans = await prisma.installationPlan.findMany({
      where,
      include: {
        customer: { select: { id: true, customerCode: true, customerName: true } },
        team: { select: { id: true, name: true, region: true } },
        department: { select: { departmentName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // ── KPI cards ──
    const total = plans.length;
    const byStatus = {
      DRAFT: 0, CONFIRMED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0,
    };
    plans.forEach(p => { byStatus[p.planStatus]++; });
    const totalSensors = plans.reduce((s, p) => s + p.sensorCount, 0);
    const completionRate = total ? Math.round((byStatus.COMPLETED / total) * 100) : 0;

    // ── Status breakdown for donut ──
    const statusBreakdown = (Object.keys(byStatus) as Array<keyof typeof byStatus>)
      .map(k => ({ status: k, count: byStatus[k] }))
      .filter(x => x.count > 0);

    // ── Region split ──
    const regionBreakdown = [
      { region: 'BANGKOK', count: plans.filter(p => p.storeRegion === 'BANGKOK').length },
      { region: 'UPC', count: plans.filter(p => p.storeRegion === 'UPC').length },
    ].filter(r => r.count > 0);

    // ── Team workload ──
    const teamMap: Record<string, any> = {};
    plans.forEach(p => {
      if (!p.team) return;
      const tid = p.team.id;
      if (!teamMap[tid]) {
        teamMap[tid] = {
          teamId: tid,
          teamName: p.team.name,
          region: p.team.region,
          total: 0, completed: 0, inProgress: 0, sensors: 0,
        };
      }
      teamMap[tid].total++;
      teamMap[tid].sensors += p.sensorCount;
      if (p.planStatus === 'COMPLETED') teamMap[tid].completed++;
      if (p.planStatus === 'IN_PROGRESS') teamMap[tid].inProgress++;
    });
    const teamWorkload = Object.values(teamMap).sort((a: any, b: any) => b.total - a.total);

    // Unassigned plans
    const unassignedCount = plans.filter(p => !p.teamId).length;

    // ── Customer breakdown ──
    const customerMap: Record<string, any> = {};
    plans.forEach(p => {
      const cid = p.customerId;
      if (!customerMap[cid]) {
        customerMap[cid] = {
          customerId: cid,
          customerCode: p.customer.customerCode,
          customerName: p.customer.customerName,
          total: 0, completed: 0, sensors: 0,
        };
      }
      customerMap[cid].total++;
      customerMap[cid].sensors += p.sensorCount;
      if (p.planStatus === 'COMPLETED') customerMap[cid].completed++;
    });
    const customerBreakdown = Object.values(customerMap).sort((a: any, b: any) => b.total - a.total);

    // ── Timeline: upcoming installations (next 7 + 30 days) ──
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const in7 = new Date(now); in7.setDate(now.getDate() + 7); in7.setHours(23, 59, 59, 999);
    const in30 = new Date(now); in30.setDate(now.getDate() + 30); in30.setHours(23, 59, 59, 999);

    const upcomingWhere: any = { scheduledDate: { gte: startOfToday, lte: in30 } };
    if (opts.region) upcomingWhere.storeRegion = opts.region;
    if (opts.customerId) upcomingWhere.customerId = opts.customerId;

    const upcoming = await prisma.installationPlan.findMany({
      where: upcomingWhere,
      include: {
        customer: { select: { customerCode: true, customerName: true } },
        team: { select: { name: true } },
      },
      orderBy: { scheduledDate: 'asc' },
      take: 50,
    });

    const upcomingThisWeek = upcoming.filter(p => p.scheduledDate && p.scheduledDate <= in7).length;
    const upcomingThisMonth = upcoming.length;

    return {
      filter: { from, to, region: opts.region || null, customerId: opts.customerId || null },
      stats: {
        total,
        draft: byStatus.DRAFT,
        confirmed: byStatus.CONFIRMED,
        inProgress: byStatus.IN_PROGRESS,
        completed: byStatus.COMPLETED,
        cancelled: byStatus.CANCELLED,
        completionRate,
        totalSensors,
        upcomingThisWeek,
        upcomingThisMonth,
        unassignedCount,
      },
      statusBreakdown,
      regionBreakdown,
      teamWorkload,
      customerBreakdown,
      upcoming: upcoming.map(p => ({
        id: p.id,
        scheduledDate: p.scheduledDate,
        storeName: p.storeName,
        branchName: p.branchName,
        province: p.province,
        storeRegion: p.storeRegion,
        sensorCount: p.sensorCount,
        planStatus: p.planStatus,
        readiness: p.readiness,
        customer: p.customer,
        team: p.team,
      })),
    };
  }
}

export const reportService = new ReportService();
