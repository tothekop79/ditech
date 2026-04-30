import { prisma } from '../config/db';
import { commandBus } from './eventBus.service';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

export class PhotoService {
  async list(planId: string) {
    return prisma.planPhoto.findMany({
      where: { planId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  async create(planId: string, file: Express.Multer.File, data: any, uploadedById?: string) {
    const photo = await prisma.planPhoto.create({
      data: {
        planId,
        category: data.category || 'OTHER',
        caption: data.caption,
        filename: file.originalname,
        storagePath: `/uploads/photos/${file.filename}`,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedById,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });

    // Fire PHOTO_UPLOADED event with hydrated plan + uploader
    (async () => {
      try {
        const plan = await prisma.installationPlan.findUnique({
          where: { id: planId },
          include: {
            customer: { select: { id: true, customerCode: true, customerName: true } },
            department: { select: { id: true, departmentCode: true, departmentName: true } },
            team: { select: { id: true, name: true, telegramChatId: true } },
          },
        });
        const { enqueueByTrigger } = await import('../queues/notification.queue');
        commandBus.emit('photo:uploaded', {
          photo: { id: photo.id, category: photo.category, caption: photo.caption, filename: photo.filename, storagePath: photo.storagePath, mimeType: photo.mimeType, createdAt: photo.createdAt },
          plan,
          uploadedBy: photo.uploadedBy,
        });
        await enqueueByTrigger('PHOTO_UPLOADED', {
          plan,
          photo: { id: photo.id, category: photo.category, caption: photo.caption, filename: photo.filename, storagePath: photo.storagePath, mimeType: photo.mimeType },
          uploadedBy: photo.uploadedBy,
        });
      } catch (err) {
        console.error('[photo] PHOTO_UPLOADED event failed:', err);
      }
    })();

    return photo;
  }

  async delete(id: string) {
    const photo = await prisma.planPhoto.findUnique({ where: { id } });
    if (photo) {
      const fullPath = `/app${photo.storagePath}`;
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (e) {
        console.warn('Could not delete file:', fullPath, e);
      }
      await prisma.planPhoto.delete({ where: { id } });
    }
    return { success: true };
  }

  async update(id: string, caption?: string, category?: string) {
    return prisma.planPhoto.update({
      where: { id },
      data: { ...(caption !== undefined && { caption }), ...(category && { category }) },
    });
  }
}
