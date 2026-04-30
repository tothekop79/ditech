import { renderTemplate } from '../services/notificationTemplate.service';
import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { prisma } from '../config/db';
import { telegramService } from '../services/telegram.service';
import { resolveRecipientChatId } from '../services/recipientResolver.service';
import { notificationQueue } from '../queues/notification.queue';
import { commandBus } from '../services/eventBus.service';

const router = Router();
router.use(authenticate);

// ──────────────────────────────────────────────────────────────
// LIST RULES
// ──────────────────────────────────────────────────────────────
router.get('/rules', async (req, res) => {
  const rules = await prisma.notificationRule.findMany({
    orderBy: [{ enabled: 'desc' }, { trigger: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: rules });
});

// GET single rule
router.get('/rules/:id', async (req, res) => {
  const rule = await prisma.notificationRule.findUnique({ where: { id: req.params.id } });
  if (!rule) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: rule });
});

// CREATE rule
router.post('/rules', authorize('ADMIN', 'PROJECT_MANAGER'), async (req, res) => {
  try {
    const body = req.body;
    if (!body.name || !body.trigger) {
      return res.status(400).json({ success: false, message: 'name and trigger are required' });
    }
    const rule = await prisma.notificationRule.create({
      data: {
        name: body.name,
        description: body.description || null,
        enabled: body.enabled ?? true,
        trigger: body.trigger,
        triggerTime: body.triggerTime || null,
        triggerDay: body.triggerDay || null,
        triggerCondition: body.triggerCondition || null,
        daysAhead: body.daysAhead || null,
        recipients: body.recipients || [],
        templateBody: body.templateBody || null,
      },
    });
    res.json({ success: true, data: rule });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// UPDATE rule
router.put('/rules/:id', authorize('ADMIN', 'PROJECT_MANAGER'), async (req, res) => {
  try {
    const body = req.body;
    const rule = await prisma.notificationRule.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.trigger !== undefined ? { trigger: body.trigger } : {}),
        ...(body.triggerTime !== undefined ? { triggerTime: body.triggerTime } : {}),
        ...(body.triggerDay !== undefined ? { triggerDay: body.triggerDay } : {}),
        ...(body.triggerCondition !== undefined ? { triggerCondition: body.triggerCondition } : {}),
        ...(body.daysAhead !== undefined ? { daysAhead: body.daysAhead } : {}),
        ...(body.recipients !== undefined ? { recipients: body.recipients } : {}),
        ...(body.templateBody !== undefined ? { templateBody: body.templateBody } : {}),
      },
    });
    res.json({ success: true, data: rule });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// TOGGLE rule (kept for backward compat)
router.patch('/rules/:id/toggle', authorize('ADMIN', 'PROJECT_MANAGER'), async (req, res) => {
  const rule = await prisma.notificationRule.findUnique({ where: { id: req.params.id } });
  if (!rule) return res.status(404).json({ success: false, message: 'Not found' });
  const updated = await prisma.notificationRule.update({
    where: { id: req.params.id }, data: { enabled: !rule.enabled },
  });
  res.json({ success: true, data: updated });
});

// DELETE rule
router.delete('/rules/:id', authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.notificationRule.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// SEND-NOW — manually trigger a rule
router.post('/rules/:id/send-now', authorize('ADMIN', 'PROJECT_MANAGER'), async (req, res) => {
  try {
    const rule = await prisma.notificationRule.findUnique({ where: { id: req.params.id } });
    if (!rule) return res.status(404).json({ success: false, message: 'Not found' });

    const now = new Date();
    let payload: any = { date: now };

    if (rule.trigger === 'WEEKLY_AT') {
      const monday = new Date(now); monday.setDate(now.getDate() - now.getDay() + 1);
      payload = { weekStart: monday };
    } else if (rule.trigger === 'EVENING_DAY_BEFORE') {
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      payload = { date: tomorrow };
    } else if (req.body.planId) {
      const plan = await prisma.installationPlan.findUnique({
        where: { id: req.body.planId },
        include: { customer: true, team: true, department: true },
      });
      if (plan) payload = { plan, condition: rule.triggerCondition };
    }

    await notificationQueue.add('send', { ruleId: rule.id, payload });
    res.json({ success: true, message: 'Queued for delivery' });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ──────────────────────────────────────────────────────────────
// TEST CONNECTION
// ──────────────────────────────────────────────────────────────
router.post('/test', authorize('ADMIN', 'PROJECT_MANAGER'), async (req, res) => {
  const recipient = req.body.recipient || 'PM Group';
  if (!telegramService.isConfigured()) {
    return res.status(400).json({ success: false, message: 'Telegram not configured. Set TELEGRAM_BOT_TOKEN in .env' });
  }
  const chatId = await resolveRecipientChatId(recipient);
  if (!chatId) {
    return res.status(400).json({
      success: false,
      message: `No chat ID for "${recipient}". Configure TELEGRAM_${recipient.toUpperCase().replace(/ /g, '_')}_CHAT_ID in .env or set team.telegramChatId`,
    });
  }
  const testMessage = `🤖 Test message from DITECH planner bot`;
  let ok = false;
  let errorMessage: string | null = null;
  try {
    await telegramService.sendMessage(chatId, testMessage);
    ok = true;
  } catch (e: any) {
    errorMessage = e?.message || 'Send failed';
  }

  // Emit SSE event so Command Wall sees realtime feedback
  if (ok) {
    commandBus.emit('notification:sent', {
      id: 'test-' + Date.now(),
      recipient,
      ruleName: 'Manual test',
      body: testMessage,
      createdAt: new Date(),
      status: 'SENT',
      photoUrl: null,
    });
  } else {
    commandBus.emit('notification:failed', {
      id: 'test-' + Date.now(),
      recipient,
      ruleName: 'Manual test',
      errorMessage: errorMessage || 'Failed',
      createdAt: new Date(),
      status: 'FAILED',
    });
  }

  res.json({ success: ok, chatId, error: errorMessage });
});

// ──────────────────────────────────────────────────────────────
// RECIPIENTS — list available recipient targets for UI dropdown
// ──────────────────────────────────────────────────────────────
router.get('/recipients', async (req, res) => {
  const teams = await prisma.team.findMany({
    where: { isActive: true },
    select: { id: true, name: true, region: true, telegramChatId: true },
    orderBy: { name: 'asc' },
  });

  const builtIns = [
    { value: 'PM Group', label: 'PM Group', envVar: 'TELEGRAM_PM_GROUP_CHAT_ID', configured: !!process.env.TELEGRAM_PM_GROUP_CHAT_ID },
    { value: 'Customer Group', label: 'Customer Group', envVar: 'TELEGRAM_CUSTOMER_GROUP_CHAT_ID', configured: !!process.env.TELEGRAM_CUSTOMER_GROUP_CHAT_ID },
    { value: 'Admin', label: 'Admin', envVar: 'TELEGRAM_ADMIN_CHAT_ID', configured: !!process.env.TELEGRAM_ADMIN_CHAT_ID },
    { value: 'Assigned team', label: 'Assigned team (auto from plan)', envVar: null, configured: true },
  ];

  const teamRecipients = teams.map(t => ({
    value: `Team ${t.name.replace(/^Team\s+/i, '')}`,
    label: `${t.name} (${t.region})`,
    envVar: null,
    configured: !!t.telegramChatId,
    teamId: t.id,
  }));

  res.json({
    success: true,
    data: {
      builtIns,
      teams: teamRecipients,
      telegramConfigured: telegramService.isConfigured(),
    },
  });
});

// ──────────────────────────────────────────────────────────────
// LOGS
// ──────────────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  const status = req.query.status as string | undefined;
  const ruleId = req.query.ruleId as string | undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || '100'), 500);

  const logs = await prisma.notificationLog.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
      ...(ruleId ? { ruleId } : {}),
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { rule: { select: { name: true, trigger: true } } },
  });
  res.json({ success: true, data: logs });
});

// ──────────────────────────────────────────────────────────────
// SEED DEFAULTS — admin can populate sample rules
// ──────────────────────────────────────────────────────────────
router.post('/seed-defaults', authorize('ADMIN'), async (req, res) => {
  const existing = await prisma.notificationRule.count();
  if (existing > 0 && !req.body.force) {
    return res.status(400).json({
      success: false,
      message: `${existing} rules already exist. Pass force:true to overwrite or skip.`,
    });
  }

  const defaults = [
    {
      name: 'Daily morning brief',
      description: 'แจ้งเตือนงานติดตั้งของวันนี้ ส่งทุกเช้า 08:00',
      trigger: 'DAILY_AT', triggerTime: '08:00',
      recipients: ['PM Group'], enabled: true,
    },
    {
      name: 'Tomorrow preview',
      description: 'แจ้งเตือนงานพรุ่งนี้ ส่งเย็นวันก่อน 17:00',
      trigger: 'EVENING_DAY_BEFORE', triggerTime: '17:00',
      recipients: ['PM Group', 'Assigned team'], enabled: true,
    },
    {
      name: 'Weekly review',
      description: 'สรุปสัปดาห์ทุกเย็นวันศุกร์ 17:00',
      trigger: 'WEEKLY_AT', triggerTime: '17:00', triggerDay: 'Friday',
      recipients: ['PM Group'], enabled: true,
    },
    {
      name: 'Plan confirmed',
      description: 'แจ้งทีมเมื่อ plan ถูก confirm',
      trigger: 'STATUS_CHANGE', triggerCondition: 'CONFIRMED',
      recipients: ['Assigned team'], enabled: true,
    },
    {
      name: 'Installation completed',
      description: 'แจ้ง PM/ลูกค้าเมื่อติดตั้งเสร็จ',
      trigger: 'STATUS_CHANGE', triggerCondition: 'COMPLETED',
      recipients: ['PM Group', 'Customer Group'], enabled: true,
    },
    {
      name: 'Branch ready',
      description: 'แจ้งเมื่อสาขาพร้อมติดตั้ง',
      trigger: 'READINESS_READY',
      recipients: ['PM Group'], enabled: true,
    },
    {
      name: 'Not ready warning',
      description: 'เตือนล่วงหน้า 3 วัน ถ้าสาขายังไม่พร้อม',
      trigger: 'NOT_READY_NEAR', daysAhead: 3,
      recipients: ['PM Group'], enabled: false,
    },
    {
      name: 'Capacity overflow',
      description: 'แจ้งเตือนเมื่อมีงานเกิน team capacity',
      trigger: 'CAPACITY_OVERFLOW',
      recipients: ['Admin'], enabled: false,
    },
  ];

  // Skip duplicates by name
  const existingNames = new Set(
    (await prisma.notificationRule.findMany({ select: { name: true } })).map(r => r.name)
  );
  const toCreate = defaults.filter(r => !existingNames.has(r.name));

  if (toCreate.length === 0) {
    return res.json({ success: true, message: 'No new defaults to add', created: 0 });
  }

  await prisma.notificationRule.createMany({ data: toCreate as any });
  res.json({ success: true, message: `Seeded ${toCreate.length} rules`, created: toCreate.length });
});


// Preview a template (does NOT send anything)
router.post('/preview', authorize('ADMIN', 'PROJECT_MANAGER'), async (req, res) => {
  try {
    const { trigger, templateBody } = req.body as { trigger: string; templateBody?: string };
    if (!trigger) {
      return res.status(400).json({ success: false, message: 'trigger is required' });
    }

    // Build sample payload — try real most-recent plan first, else static sample
    let plan: any = null;
    try {
      plan = await prisma.installationPlan.findFirst({
        where: { teamId: { not: null } },
        include: {
          customer: { select: { id: true, customerCode: true, customerName: true } },
          department: { select: { id: true, departmentCode: true, departmentName: true } },
          team: { select: { id: true, name: true, telegramChatId: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch { /* ignore */ }

    if (!plan) {
      plan = {
        id: 'sample-uuid',
        storeName: 'Central Rayong',
        branchName: 'Rayong',
        scheduledDate: new Date('2026-05-05T00:00:00.000Z'),
        sensorCount: 3,
        sensorModel: 'G5 Sensor',
        province: 'Rayong',
        readiness: 'PENDING',
        planStatus: 'CONFIRMED',
        detail: 'sample plan',
        customer: { customerCode: 'XIAOMI', customerName: 'Xiaomi (Thailand)' },
        department: { departmentCode: 'CENTRAL', departmentName: 'Central' },
        team: { name: 'BKK Team' },
      };
    }

    // Sample sub-payloads for trigger-specific variables
    const samplePayload: any = {
      plan,
      condition: trigger === 'STATUS_CHANGE' ? 'CONFIRMED' : undefined,
      oldDate: new Date('2026-04-30T00:00:00.000Z'),
      newDate: new Date('2026-05-05T00:00:00.000Z'),
      isFirstTime: false,
      oldTeam: { name: 'ทีมภาคใต้' },
      newTeam: { name: 'BKK Team' },
      isFirstAssign: false,
      isUnassigned: false,
      date: new Date(),
      weekStart: new Date(),
    };

    // Build a fake rule object to pass to renderTemplate
    const fakeRule: any = {
      id: 'preview-rule',
      trigger: trigger as any,
      templateBody: templateBody || null,
      daysAhead: 3,
    };

    const message = await renderTemplate(fakeRule, samplePayload);
    res.json({ success: true, data: { message, sampleSource: plan.id === 'sample-uuid' ? 'static' : 'realPlan' } });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'Preview failed' });
  }
});

export default router;
