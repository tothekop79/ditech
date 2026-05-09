import { PrismaClient, Prisma, EventStatus, EventProfile } from '@prisma/client';

const prisma = new PrismaClient();

export interface EventCreateInput {
  name: string;
  organizer?: string;
  venue?: string;
  venueType?: string;
  startDate: string;          // ISO date
  endDate: string;
  profile?: 'SIMPLE' | 'STANDARD' | 'FULL';
  description?: string;
  systemCredit?: string;
  confidential?: boolean;
  showPasserby?: boolean;
  customerId?: string | null;
  displayHoursStart?: number;
  displayHoursEnd?: number;
  dwellMinSec?: number;
  dwellMaxSec?: number;
  engagementThresholdSec?: number;
  sponsorZones?: string;
  // Initial setup data
  days?: Array<{ dayNumber: number; date: string; label: string; color?: string }>;
  gates?: Array<{ name: string; gateType: 'ENTRANCE' | 'PASSERBY'; sortOrder?: number }>;
  zones?: Array<{ name: string; abbrev?: string; sortOrder?: number }>;
  activities?: Array<{ date: string; startTime: string; endTime: string; name: string; zone?: string; description?: string }>;
}

const DEFAULT_DAY_COLORS = [
  '#1F77B4', // blue
  '#FF7F0E', // orange
  '#2CA02C', // green
  '#D62728', // red
  '#9467BD', // purple
];

export const eventService = {
  // ── List with filters ──
  async list(filters: { status?: EventStatus; customerId?: string; q?: string; from?: string; to?: string } = {}) {
    const where: Prisma.EventWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { organizer: { contains: filters.q, mode: 'insensitive' } },
        { venue: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    if (filters.from || filters.to) {
      where.startDate = {};
      if (filters.from) (where.startDate as any).gte = new Date(filters.from);
      if (filters.to) (where.startDate as any).lte = new Date(filters.to);
    }

    return prisma.event.findMany({
      where,
      include: {
        customer: { select: { id: true, customerCode: true, customerName: true } },
        _count: { select: { plans: true, days: true, reports: true } },
        reports: {
          select: { id: true, status: true, completedAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { startDate: 'desc' },
    });
  },

  // ── Get full event with all relations ──
  async get(id: string) {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, customerCode: true, customerName: true } },
        days: { orderBy: { dayNumber: 'asc' } },
        gates: { orderBy: { sortOrder: 'asc' } },
        zones: { orderBy: { sortOrder: 'asc' } },
        activities: { orderBy: [{ date: 'asc' }, { startTime: 'asc' }] },
        plans: {
          select: {
            id: true, storeName: true, branchName: true, planStatus: true, scheduledDate: true,
          },
        },
        reports: {
          orderBy: { createdAt: 'desc' },
          include: {
            triggeredBy: { select: { id: true, fullName: true } },
          },
        },
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { plans: true, reports: true } },
      },
    });
    if (!event) throw new Error('Event not found');
    return event;
  },

  // ── Create event with optional initial setup ──
  async create(data: EventCreateInput, createdById?: string | null) {
    const rawDays = data.days?.length
      ? data.days
      : this.generateDaysFromRange(data.startDate, data.endDate);
    // Normalize: ensure date is a Date object (string from JSON would fail Prisma)
    const days = rawDays.map((d: any) => ({
      ...d,
      date: d.date instanceof Date ? d.date : new Date(d.date),
    }));

    return prisma.event.create({
      data: {
        name: data.name,
        organizer: data.organizer || null,
        venue: data.venue || null,
        venueType: data.venueType || 'Booth',
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        profile: data.profile || 'FULL',
        description: data.description || null,
        systemCredit: data.systemCredit || 'AI People Counting',
        confidential: data.confidential ?? true,
        showPasserby: data.showPasserby ?? true,
        customerId: data.customerId || null,
        displayHoursStart: data.displayHoursStart ?? 9,
        displayHoursEnd: data.displayHoursEnd ?? 19,
        dwellMinSec: data.dwellMinSec ?? 0,
        dwellMaxSec: data.dwellMaxSec ?? 3600,
        engagementThresholdSec: data.engagementThresholdSec ?? 60,
        sponsorZones: data.sponsorZones || null,
        createdById: createdById || null,
        days: { create: days },
        gates: data.gates?.length ? { create: data.gates } : undefined,
        zones: data.zones?.length ? { create: data.zones } : undefined,
        activities: data.activities?.length
          ? {
              create: data.activities.map((a) => ({
                ...a,
                date: new Date(a.date),
              })),
            }
          : undefined,
      },
      include: {
        days: true,
        gates: true,
        zones: true,
        activities: true,
      },
    });
  },

  // ── Generate days[] from date range ──
  generateDaysFromRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days: Array<{ dayNumber: number; date: Date; label: string; color: string }> = [];
    let d = 1;
    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      days.push({
        dayNumber: d,
        date: new Date(cur),
        label: `Day ${d}`,
        color: DEFAULT_DAY_COLORS[(d - 1) % DEFAULT_DAY_COLORS.length],
      });
      d++;
    }
    return days;
  },

  // ── Update event metadata ──
  async update(id: string, data: Partial<EventCreateInput>) {
    const updateData: Prisma.EventUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.organizer !== undefined) updateData.organizer = data.organizer;
    if (data.venue !== undefined) updateData.venue = data.venue;
    if (data.venueType !== undefined) updateData.venueType = data.venueType;
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
    if (data.profile !== undefined) updateData.profile = data.profile;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.systemCredit !== undefined) updateData.systemCredit = data.systemCredit;
    if (data.confidential !== undefined) updateData.confidential = data.confidential;
    if (data.showPasserby !== undefined) updateData.showPasserby = data.showPasserby;
    if (data.customerId !== undefined) {
      updateData.customer = data.customerId
        ? { connect: { id: data.customerId } }
        : { disconnect: true };
    }
    if (data.displayHoursStart !== undefined) updateData.displayHoursStart = data.displayHoursStart;
    if (data.displayHoursEnd !== undefined) updateData.displayHoursEnd = data.displayHoursEnd;
    if (data.dwellMinSec !== undefined) updateData.dwellMinSec = data.dwellMinSec;
    if (data.dwellMaxSec !== undefined) updateData.dwellMaxSec = data.dwellMaxSec;
    if (data.engagementThresholdSec !== undefined) updateData.engagementThresholdSec = data.engagementThresholdSec;
    if (data.sponsorZones !== undefined) updateData.sponsorZones = data.sponsorZones;

    return prisma.event.update({ where: { id }, data: updateData });
  },

  async setStatus(id: string, status: EventStatus) {
    return prisma.event.update({ where: { id }, data: { status } });
  },

  async delete(id: string) {
    return prisma.event.delete({ where: { id } });
  },

  // ── Replace days ──
  async setDays(eventId: string, days: Array<{ dayNumber: number; date: string; label: string; color?: string }>) {
    await prisma.eventDay.deleteMany({ where: { eventId } });
    return prisma.eventDay.createMany({
      data: days.map((d) => ({ ...d, eventId, date: new Date(d.date) })),
    });
  },

  // ── Replace gates ──
  async setGates(eventId: string, gates: Array<{ name: string; gateType: string; sortOrder?: number }>) {
    await prisma.eventGate.deleteMany({ where: { eventId } });
    if (!gates.length) return { count: 0 };
    return prisma.eventGate.createMany({
      data: gates.map((g, i) => ({ ...g, eventId, sortOrder: g.sortOrder ?? i })),
    });
  },

  // ── Replace zones ──
  async setZones(eventId: string, zones: Array<{ name: string; abbrev?: string; sortOrder?: number }>) {
    await prisma.eventZone.deleteMany({ where: { eventId } });
    if (!zones.length) return { count: 0 };
    return prisma.eventZone.createMany({
      data: zones.map((z, i) => ({ ...z, eventId, sortOrder: z.sortOrder ?? i })),
    });
  },

  // ── Replace activities ──
  async setActivities(
    eventId: string,
    activities: Array<{ date: string; startTime: string; endTime: string; name: string; zone?: string; description?: string }>,
  ) {
    await prisma.eventActivity.deleteMany({ where: { eventId } });
    if (!activities.length) return { count: 0 };
    return prisma.eventActivity.createMany({
      data: activities.map((a) => ({ ...a, eventId, date: new Date(a.date) })),
    });
  },

  // ── Linking plans (sub-installations) ──
  async linkPlan(eventId: string, planId: string) {
    return prisma.installationPlan.update({
      where: { id: planId },
      data: { eventId },
    });
  },

  async unlinkPlan(planId: string) {
    return prisma.installationPlan.update({
      where: { id: planId },
      data: { eventId: null },
    });
  },
};
