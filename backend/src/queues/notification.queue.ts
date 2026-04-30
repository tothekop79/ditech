import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { prisma } from '../config/db';
import { telegramService } from '../services/telegram.service';
import { resolveRecipientChatId } from '../services/recipientResolver.service';
import { renderTemplate } from '../services/notificationTemplate.service';
import { commandBus } from '../services/eventBus.service';
import path from 'path';

export const notificationQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

if (process.env.NODE_ENV !== 'test') {
  new Worker('notifications', async (job) => {
    const { ruleId, payload } = job.data;
    const rule = await prisma.notificationRule.findUnique({ where: { id: ruleId } });
    if (!rule || !rule.enabled) return { skipped: 'rule disabled' };
    if (!telegramService.isConfigured()) return { skipped: 'telegram not configured' };

    const message = await renderTemplate(rule, payload);

    for (const recipient of rule.recipients) {
      const chatId = await resolveRecipientChatId(recipient, payload);
      if (!chatId) {
        const failLog = await prisma.notificationLog.create({
          data: { ruleId, recipient, body: message, status: 'FAILED', errorMessage: 'No chat ID' },
        });
        commandBus.emit('notification:failed', {
          id: failLog.id, recipient, ruleName: rule.name, errorMessage: 'No chat ID',
          createdAt: failLog.createdAt, status: 'FAILED',
        });
        continue;
      }
      let photoUrl: string | null = null;
      if (rule.trigger === 'PHOTO_UPLOADED' && payload?.photo?.storagePath) {
        // storagePath is "/uploads/photos/<filename>" — encode the filename portion
        // for browser-safe URLs (handles spaces, Thai chars, etc.)
        const sp = String(payload.photo.storagePath);
        const lastSlash = sp.lastIndexOf('/');
        if (lastSlash >= 0) {
          photoUrl = sp.slice(0, lastSlash + 1) + encodeURIComponent(sp.slice(lastSlash + 1));
        } else {
          photoUrl = encodeURIComponent(sp);
        }
      }

      try {
        // PHOTO_UPLOADED: send actual photo with rendered template as caption
        if (rule.trigger === 'PHOTO_UPLOADED' && payload?.photo?.storagePath) {
          const filename = path.basename(String(payload.photo.storagePath));
          const fullPath = path.join('/app/uploads/photos', filename);
          try {
            await telegramService.sendPhoto(chatId, fullPath, message);
          } catch (photoErr: any) {
            console.warn(`[notif] sendPhoto failed for ${filename}, falling back to text:`, photoErr?.message || photoErr);
            await telegramService.sendMessage(chatId, message);
            photoUrl = null; // photo didn't actually go out
          }
        } else {
          await telegramService.sendMessage(chatId, message);
        }
        const sentLog = await prisma.notificationLog.create({
          data: { ruleId, recipient, body: message, status: 'SENT', sentAt: new Date() },
        });
        commandBus.emit('notification:sent', {
          id: sentLog.id, recipient, ruleName: rule.name, body: message,
          createdAt: sentLog.createdAt, status: 'SENT',
          photoUrl,
        });
      } catch (err: any) {
        const failLog = await prisma.notificationLog.create({
          data: { ruleId, recipient, body: message, status: 'FAILED', errorMessage: err.message },
        });
        commandBus.emit('notification:failed', {
          id: failLog.id, recipient, ruleName: rule.name, errorMessage: err.message,
          createdAt: failLog.createdAt, status: 'FAILED',
        });
        throw err;
      }
    }
  }, {
    connection: redis,
    limiter: { max: 25, duration: 1000 },
  });
}

export async function enqueueByTrigger(trigger: string, payload: any) {
  const rules = await prisma.notificationRule.findMany({
    where: { enabled: true, trigger: trigger as any },
  });
  for (const rule of rules) {
    if (rule.triggerCondition && rule.triggerCondition !== payload.condition) continue;
    await notificationQueue.add('send', { ruleId: rule.id, payload });
  }
}
