import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class CommunicationLogService {
  async list(planId: string) {
    return prisma.planCommunicationLog.findMany({
      where: { planId },
      orderBy: { contactedAt: 'desc' },
      include: { recordedBy: { select: { id: true, fullName: true } } },
    });
  }

  async create(planId: string, data: any, recordedById?: string) {
    return prisma.planCommunicationLog.create({
      data: {
        planId,
        channel: data.channel,
        direction: data.direction,
        contactedAt: data.contactedAt ? new Date(data.contactedAt) : new Date(),
        contactPerson: data.contactPerson,
        summary: data.summary,
        outcome: data.outcome,
        recordedById,
      },
      include: { recordedBy: { select: { id: true, fullName: true } } },
    });
  }

  async delete(id: string) {
    await prisma.planCommunicationLog.delete({ where: { id } });
    return { success: true };
  }
}
