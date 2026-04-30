import { prisma } from '../config/db';
import { StoreRegion } from '@prisma/client';

export class CapacityService {
  async getDailyCapacity(date: Date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);

    const [plans, teams] = await Promise.all([
      prisma.installationPlan.findMany({
        where: { scheduledDate: { gte: start, lte: end } },
        include: { team: true },
      }),
      prisma.team.findMany({ where: { isActive: true } }),
    ]);

    const bkkCap = teams.filter(t => t.region === 'BANGKOK').reduce((s, t) => s + t.dailyCap, 0);
    const upcCap = teams.filter(t => t.region === 'UPC').reduce((s, t) => s + t.dailyCap, 0);
    const bkkUsed = plans.filter(p => p.storeRegion === 'BANGKOK').length;
    const upcUsed = plans.filter(p => p.storeRegion === 'UPC').length;

    return {
      date: date.toISOString().split('T')[0],
      bkkUsed, bkkCap, upcUsed, upcCap,
      total: bkkUsed + upcUsed,
      totalCap: bkkCap + upcCap,
      overflow: bkkUsed > bkkCap || upcUsed > upcCap,
    };
  }

  async getMonthHeatmap(year: number, month: number) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const days: any[] = [];

    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      days.push(await this.getDailyCapacity(new Date(d)));
    }
    return days;
  }

  async detectConflicts(from?: Date, to?: Date) {
    const where: any = {};
    if (from || to) {
      where.scheduledDate = {};
      if (from) where.scheduledDate.gte = from;
      if (to) where.scheduledDate.lte = to;
    } else {
      const now = new Date();
      where.scheduledDate = { gte: now };
    }

    const plans = await prisma.installationPlan.findMany({
      where,
      include: { customer: true, team: true },
    });
    const teams = await prisma.team.findMany();
    const teamMap = new Map(teams.map(t => [t.id, t]));
    const conflicts: any[] = [];

    const dateMap: Record<string, any[]> = {};
    plans.forEach(p => {
      if (!p.scheduledDate) return;
      for (let i = 0; i < (p.durationDays || 1); i++) {
        const d = new Date(p.scheduledDate);
        d.setDate(d.getDate() + i);
        const k = d.toISOString().split('T')[0];
        if (!dateMap[k]) dateMap[k] = [];
        dateMap[k].push(p);
      }
    });

    Object.entries(dateMap).forEach(([date, dayPlans]) => {
      const teamGroups: Record<string, any[]> = {};
      dayPlans.forEach(p => {
        if (p.teamId) {
          if (!teamGroups[p.teamId]) teamGroups[p.teamId] = [];
          teamGroups[p.teamId].push(p);
        }
      });
      Object.entries(teamGroups).forEach(([tid, ps]) => {
        const team = teamMap.get(tid);
        if (team && ps.length > team.dailyCap) {
          conflicts.push({
            type: 'team-overload', date,
            teamId: tid, teamName: team.name,
            plans: ps.map(p => ({ id: p.id, storeName: p.storeName })),
          });
        }
      });

      const bkkUsed = dayPlans.filter(p => p.storeRegion === 'BANGKOK').length;
      const upcUsed = dayPlans.filter(p => p.storeRegion === 'UPC').length;
      const bkkCap = teams.filter(t => t.region === 'BANGKOK').reduce((s, t) => s + t.dailyCap, 0);
      const upcCap = teams.filter(t => t.region === 'UPC').reduce((s, t) => s + t.dailyCap, 0);

      if (bkkUsed > bkkCap) conflicts.push({ type: 'region-overload', date, region: 'Bangkok', used: bkkUsed, cap: bkkCap });
      if (upcUsed > upcCap) conflicts.push({ type: 'region-overload', date, region: 'Up-country', used: upcUsed, cap: upcCap });
    });

    const today = new Date();
    plans.forEach(p => {
      if (p.scheduledDate && p.planStatus === 'DRAFT' && p.readiness !== 'READY') {
        const days = Math.floor((p.scheduledDate.getTime() - today.getTime()) / 86400000);
        if (days >= 0 && days <= 7) {
          conflicts.push({ type: 'not-ready-soon', plan: { id: p.id, storeName: p.storeName, scheduledDate: p.scheduledDate, detail: p.detail, readiness: p.readiness }, daysUntil: days });
        }
      }
      if (p.scheduledDate && p.readiness === 'READY' && !p.teamId && p.planStatus === 'DRAFT') {
        conflicts.push({ type: 'no-team', plan: { id: p.id, storeName: p.storeName, scheduledDate: p.scheduledDate, province: p.province } });
      }
    });

    return conflicts;
  }
}

export const capacityService = new CapacityService();
