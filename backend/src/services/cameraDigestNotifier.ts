/**
 * Wires the camera monitor digest to Telegram via NotificationRule(trigger=CAMERA_DIGEST).
 * Add a rule in the Notifications UI with the target chat/group ids in `recipients`.
 * telegramService.sendMessage() uses parse_mode=Markdown, so anything that is Markdown syntax
 * in site/device names (_ * ` [) must be escaped or Telegram rejects the whole message.
 */
import { PrismaClient } from '@prisma/client';
import { telegramService } from './telegram.service';
import { setNotifier } from './deviceMonitor.service';

const prisma = new PrismaClient();
const escapeMd = (s: string) => s.replace(/([_*`\[])/g, '\\$1');

export function wireCameraDigestToTelegram() {
  setNotifier(async (text) => {
    const rules = await prisma.notificationRule.findMany({ where: { trigger: 'CAMERA_DIGEST' as any, enabled: true } });
    const chatIds = [...new Set(rules.flatMap(r => r.recipients))];
    if (!chatIds.length) { console.warn('[monitor] digest ready but no enabled CAMERA_DIGEST rule / recipients'); return; }
    const safe = escapeMd(text);
    for (const chatId of chatIds) {
      try { await telegramService.sendMessage(chatId, safe); }
      catch (e: any) { console.error(`[monitor] telegram send failed for ${chatId}:`, e?.message ?? e); }
    }
  });
  console.log('[monitor] digest → Telegram (NotificationRule CAMERA_DIGEST)');
}
