import { PrismaClient, StoreRegion } from '@prisma/client';

const prisma = new PrismaClient();

export class TeamService {
  async list() {
    return prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: true, assignedPlans: true } },
        leadUser: { select: { id: true, fullName: true, email: true } },
        members: {
          select: {
            role: true,
            user: {
              select: { id: true, fullName: true, role: true, email: true, idCardPhotoUrl: true, position: true, province: true },
            },
          },
        },
      },
    });
  }

  async create(data: { name: string; region: StoreRegion; telegramChatId?: string | null; dailyCap?: number }) {
    const exists = await prisma.team.findUnique({ where: { name: data.name } });
    if (exists) throw new Error('Team name already exists');
    return prisma.team.create({
      data: {
        name: data.name,
        region: data.region,
        telegramChatId: data.telegramChatId || null,
        dailyCap: data.dailyCap || 1,
      },
    });
  }

  async update(teamId: string, data: { name?: string; region?: StoreRegion; telegramChatId?: string | null; dailyCap?: number; isActive?: boolean }) {
    if (data.name) {
      const dup = await prisma.team.findFirst({ where: { name: data.name, NOT: { id: teamId } } });
      if (dup) throw new Error('Team name already exists');
    }
    return prisma.team.update({ where: { id: teamId }, data });
  }

  async delete(teamId: string) {
    const planCount = await prisma.installationPlan.count({ where: { teamId } });
    if (planCount > 0) throw new Error(`Cannot delete: ${planCount} plans assigned to this team`);
    await prisma.teamMember.deleteMany({ where: { teamId } });
    await prisma.team.delete({ where: { id: teamId } });
    return { success: true };
  }

  async addMember(teamId: string, userId: string) {
    return prisma.teamMember.create({
      data: { teamId, userId },
      include: { user: { select: { id: true, fullName: true, role: true } } },
    });
  }

  async removeMember(teamId: string, userId: string) {
    // If removing the team lead — unset leadUserId
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (team?.leadUserId === userId) {
      await prisma.team.update({ where: { id: teamId }, data: { leadUserId: null } });
    }
    await prisma.teamMember.deleteMany({ where: { teamId, userId } });
    return { success: true };
  }

  async setLead(teamId: string, userId: string | null) {
    if (userId) {
      // Verify user is a member
      const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
      if (!member) throw new Error('User is not a member of this team — add as member first');
      // Update role on TeamMember table
      await prisma.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { role: 'LEAD' } });
      // Demote previous lead's TeamMember.role back to MEMBER
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (team?.leadUserId && team.leadUserId !== userId) {
        try {
          await prisma.teamMember.update({
            where: { teamId_userId: { teamId, userId: team.leadUserId } },
            data: { role: 'MEMBER' },
          });
        } catch {}
      }
    } else {
      // Demote current lead
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (team?.leadUserId) {
        try {
          await prisma.teamMember.update({
            where: { teamId_userId: { teamId, userId: team.leadUserId } },
            data: { role: 'MEMBER' },
          });
        } catch {}
      }
    }
    return prisma.team.update({ where: { id: teamId }, data: { leadUserId: userId } });
  }

  async updateChatId(teamId: string, telegramChatId: string | null) {
    return prisma.team.update({
      where: { id: teamId },
      data: { telegramChatId },
    });
  }
}
