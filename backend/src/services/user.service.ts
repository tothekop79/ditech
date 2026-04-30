import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export class UserService {
  async list(filters: { role?: UserRole; isActive?: boolean }) {
    return prisma.user.findMany({
      where: {
        ...(filters.role && { role: filters.role }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      },
      select: {
        id: true, email: true, fullName: true, phone: true,
        role: true, isActive: true, createdAt: true,
        idCard: true, idCardPhotoUrl: true, position: true, phoneForDoc: true, province: true,
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(data: {
    email: string; password: string; fullName: string;
    phone?: string; role: UserRole;
    idCard?: string | null; idCardPhotoUrl?: string | null;
    position?: string | null; phoneForDoc?: string | null; province?: string | null;
  }) {
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new Error('Email already exists');
    const hash = await bcrypt.hash(data.password, 10);
    return prisma.user.create({
      data: { ...data, password: hash },
      select: {
        id: true, email: true, fullName: true, phone: true,
        role: true, isActive: true, createdAt: true,
        idCard: true, idCardPhotoUrl: true, position: true, phoneForDoc: true, province: true,
      },
    });
  }

  async update(id: string, data: {
    fullName?: string; phone?: string; role?: UserRole; isActive?: boolean;
    idCard?: string | null; idCardPhotoUrl?: string | null;
    position?: string | null; phoneForDoc?: string | null; province?: string | null;
  }) {
    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, fullName: true, phone: true,
        role: true, isActive: true, createdAt: true,
        idCard: true, idCardPhotoUrl: true, position: true, phoneForDoc: true, province: true,
      },
    });
  }

  async resetPassword(id: string, newPassword: string) {
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id }, data: { password: hash } });
    return { success: true };
  }
}
