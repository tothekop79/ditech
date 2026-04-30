import cron from 'node-cron';
import { prisma } from '../config/db';
import { redis } from '../config/redis';
import { notificationQueue } from '../queues/notification.queue';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const lock = await redis.set('cron-lock-min', '1', 'EX', 50, 'NX');
    if (!lock) return;
    try { await runMinuteCheck(); } catch (e) { console.error('Cron min error:', e); }
  });

  cron.schedule('0 * * * *', async () => {
    const lock = await redis.set('cron-lock-hour', '1', 'EX', 3500, 'NX');
    if (!lock) return;
    try { await runHourCheck(); } catch (e) { console.error('Cron hour error:', e); }
  });

  console.log('✓ Scheduler started');
}

async function runMinuteCheck() {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const day = DAYS[now.getDay()];

  const daily = await prisma.notificationRule.findMany({
    where: { enabled: true, trigger: 'DAILY_AT', triggerTime: time },
  });
  for (const r of daily) await notificationQueue.add('send', { ruleId: r.id, payload: { date: now } });

  const evening = await prisma.notificationRule.findMany({
    where: { enabled: true, trigger: 'EVENING_DAY_BEFORE', triggerTime: time },
  });
  for (const r of evening) {
    const t = new Date(now); t.setDate(t.getDate() + 1);
    await notificationQueue.add('send', { ruleId: r.id, payload: { date: t } });
  }

  const weekly = await prisma.notificationRule.findMany({
    where: { enabled: true, trigger: 'WEEKLY_AT', triggerTime: time, triggerDay: day },
  });
  for (const r of weekly) {
    const monday = new Date(now); monday.setDate(monday.getDate() - now.getDay() + 1);
    await notificationQueue.add('send', { ruleId: r.id, payload: { weekStart: monday } });
  }
}

async function runHourCheck() {
  const rules = await prisma.notificationRule.findMany({
    where: { enabled: true, trigger: 'NOT_READY_NEAR' },
  });
  for (const r of rules) {
    const target = new Date();
    target.setDate(target.getDate() + (r.daysAhead || 3));
    target.setHours(0, 0, 0, 0);
    const end = new Date(target); end.setHours(23, 59, 59, 999);

    const plans = await prisma.installationPlan.findMany({
      where: {
        scheduledDate: { gte: target, lte: end },
        readiness: 'NOT_READY', planStatus: 'DRAFT',
      },
      include: { customer: true },
    });
    for (const plan of plans) {
      await notificationQueue.add('send', { ruleId: r.id, payload: { plan } });
    }
  }
}
