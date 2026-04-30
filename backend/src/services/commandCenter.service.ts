import { prisma } from '../config/db';

/**
 * Aggregates all data needed for the Command Center dashboard.
 * Called on initial load + as a periodic re-fetch fallback.
 */
export const commandCenterService = {
  async snapshot() {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const weekAhead = new Date(now); weekAhead.setDate(weekAhead.getDate() + 7);

    const [
      totalPlans,
      todayPlans,
      thisWeekPlans,
      completedThisMonth,
      readyPlans,
      notReadyPlans,
      totalSensors,
      todaysList,
      tomorrowsList,
      teams,
      recentChanges,
      recentTelegramLogs,
      recentPhotos,
      monthPlans,
      upcoming30Days,
    ] = await Promise.all([
      // KPIs
      prisma.installationPlan.count(),
      prisma.installationPlan.count({
        where: { scheduledDate: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.installationPlan.count({
        where: { scheduledDate: { gte: todayStart, lte: weekAhead } },
      }),
      prisma.installationPlan.count({
        where: {
          planStatus: 'COMPLETED',
          completedDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        },
      }),
      prisma.installationPlan.count({ where: { readiness: 'READY' } }),
      prisma.installationPlan.count({ where: { readiness: 'NOT_READY' } }),
      prisma.installationPlan.aggregate({ _sum: { sensorCount: true } }),

      // Today's plans (full info for cards)
      prisma.installationPlan.findMany({
        where: { scheduledDate: { gte: todayStart, lte: todayEnd } },
        include: {
          customer: { select: { customerCode: true, customerName: true } },
          team: { select: { name: true } },
        },
        orderBy: { storeName: 'asc' },
      }),

      // Tomorrow's plans
      prisma.installationPlan.findMany({
        where: {
          scheduledDate: {
            gte: new Date(todayEnd.getTime() + 1),
            lte: new Date(todayEnd.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        include: {
          customer: { select: { customerCode: true } },
          team: { select: { name: true } },
        },
      }),

      // Team workload (week ahead)
      prisma.team.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          region: true,
          dailyCap: true,
          telegramChatId: true,
          assignedPlans: {
            where: { scheduledDate: { gte: todayStart, lte: weekAhead } },
            select: { id: true, planStatus: true },
          },
        },
      }),

      // Last 30 status changes (activity feed)
      prisma.planStatusHistory.findMany({
        take: 30,
        orderBy: { changedAt: 'desc' },
        include: {
          plan: { select: { id: true, storeName: true, customer: { select: { customerCode: true } } } },
          changedBy: { select: { fullName: true } },
        },
      }),

      // Recent Telegram messages (sent + failed)
      prisma.notificationLog.findMany({
        take: 30,
        orderBy: { createdAt: 'desc' },
        include: { rule: { select: { name: true, trigger: true } } },
      }),

      // Last 10 photos
      prisma.planPhoto.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          filename: true,
          storagePath: true,
          createdAt: true,
          plan: { select: { storeName: true, customer: { select: { customerCode: true } } } },
          uploadedBy: { select: { fullName: true } },
        },
      }),

      // Month calendar — all plans in current month
      (async () => {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return prisma.installationPlan.findMany({
          where: { scheduledDate: { gte: monthStart, lte: monthEnd } },
          select: {
            id: true,
            storeName: true,
            branchName: true,
            scheduledDate: true,
            planStatus: true,
            readiness: true,
            storeRegion: true,
            sensorCount: true,
            workScope: true,
            workStartTime: true,
            workEndTime: true,
            customer: { select: { customerCode: true, customerName: true } },
            team: { select: { name: true } },
          },
          orderBy: { scheduledDate: 'asc' },
        });
      })(),

      // 30-day upcoming
      prisma.installationPlan.findMany({
        where: {
          scheduledDate: {
            gte: todayStart,
            lte: new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          storeName: true,
          branchName: true,
          scheduledDate: true,
          planStatus: true,
          readiness: true,
          storeRegion: true,
          province: true,
          sensorCount: true,
          workScope: true,
          workStartTime: true,
          workEndTime: true,
          customer: { select: { customerCode: true, customerName: true } },
          team: { select: { name: true } },
        },
        orderBy: { scheduledDate: 'asc' },
      }),
    ]);

    // Enrich PHOTO_UPLOADED logs with photoUrl by joining with recent photos
    const enrichedLogs = await enrichLogsWithPhotoUrls(recentTelegramLogs, recentPhotos);

    // Group plans by region for "Locations" panel (placeholder for map)
    const allUpcoming = await prisma.installationPlan.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: weekAhead },
      },
      select: {
        id: true,
        storeName: true,
        province: true,
        storeRegion: true,
        scheduledDate: true,
        customer: { select: { customerCode: true } },
      },
    });

    const byRegion = {
      BANGKOK: allUpcoming.filter(p => p.storeRegion === 'BANGKOK'),
      UPC: allUpcoming.filter(p => p.storeRegion === 'UPC'),
    };

    return {
      generatedAt: now.toISOString(),
      kpi: {
        totalPlans,
        todayCount: todayPlans,
        weekAheadCount: thisWeekPlans,
        completedThisMonth,
        readyCount: readyPlans,
        notReadyCount: notReadyPlans,
        totalSensors: totalSensors._sum.sensorCount || 0,
      },
      todaysList,
      tomorrowsList,
      teams: teams.map(t => ({
        id: t.id,
        name: t.name,
        region: t.region,
        dailyCap: t.dailyCap,
        hasChatId: !!t.telegramChatId,
        weekLoad: t.assignedPlans.length,
        breakdown: {
          confirmed: t.assignedPlans.filter(p => p.planStatus === 'CONFIRMED').length,
          inProgress: t.assignedPlans.filter(p => p.planStatus === 'IN_PROGRESS').length,
          completed: t.assignedPlans.filter(p => p.planStatus === 'COMPLETED').length,
          draft: t.assignedPlans.filter(p => p.planStatus === 'DRAFT').length,
        },
      })),
      recentChanges,
      recentTelegramLogs: enrichedLogs,
      recentPhotos,
      byRegion,
      monthCalendar: buildMonthCalendar(now, monthPlans),
      upcoming30Days,
    };
  },
};

// Build a 6-week calendar grid starting from the Sunday before month start
function buildMonthCalendar(refDate: Date, plans: any[]) {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  // Group plans by date string YYYY-MM-DD
  const byDate: Record<string, any[]> = {};
  for (const p of plans) {
    if (!p.scheduledDate) continue;
    const d = new Date(p.scheduledDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(p);
  }

  // Find first Sunday on or before monthStart
  const startSunday = new Date(monthStart);
  startSunday.setDate(monthStart.getDate() - monthStart.getDay());

  const cells: Array<{ date: string; day: number; isCurrentMonth: boolean; isToday: boolean; count: number; plans: any[] }> = [];
  const todayKey = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}-${String(refDate.getDate()).padStart(2, '0')}`;

  for (let i = 0; i < 42; i++) {
    const d = new Date(startSunday);
    d.setDate(startSunday.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayPlans = byDate[key] || [];
    cells.push({
      date: key,
      day: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday: key === todayKey,
      count: dayPlans.length,
      plans: dayPlans,
    });
  }

  return {
    year,
    month: month + 1,
    monthLabel: refDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
    cells,
    totalInMonth: plans.length,
  };
}

/**
 * Best-effort: attach photoUrl to PHOTO_UPLOADED notification logs by
 * matching with the most recent photo created at the same time (±5 min window).
 * For SSE-driven new events, photoUrl is set directly in the queue.
 */
async function enrichLogsWithPhotoUrls(logs: any[], photos: any[]): Promise<any[]> {
  if (!Array.isArray(photos) || photos.length === 0) return logs;

  const encodePhotoUrl = (storagePath: string | null | undefined): string | null => {
    if (!storagePath) return null;
    const sp = String(storagePath);
    const lastSlash = sp.lastIndexOf('/');
    return lastSlash >= 0
      ? sp.slice(0, lastSlash + 1) + encodeURIComponent(sp.slice(lastSlash + 1))
      : encodeURIComponent(sp);
  };

  // Sort photos by createdAt (oldest first) for sequential matching
  const sortedPhotos = [...photos].sort(
    (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const usedIds = new Set<string>();

  return logs.map((log: any) => {
    const isPhotoTrigger = log.rule?.trigger === 'PHOTO_UPLOADED';
    if (!isPhotoTrigger) return log;

    const logTime = new Date(log.createdAt).getTime();

    // Find closest unused photo within ±5 minutes
    let bestMatch: any = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const p of sortedPhotos) {
      if (usedIds.has(p.id)) continue;
      const delta = Math.abs(new Date(p.createdAt).getTime() - logTime);
      if (delta < 5 * 60 * 1000 && delta < bestDelta) {
        bestMatch = p;
        bestDelta = delta;
      }
    }

    if (bestMatch) {
      usedIds.add(bestMatch.id);
      const photoUrl = encodePhotoUrl(bestMatch.storagePath);
      if (photoUrl) return { ...log, photoUrl };
    }
    return log;
  });
}

