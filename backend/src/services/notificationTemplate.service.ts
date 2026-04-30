import { NotificationRule } from '@prisma/client';
import { prisma } from '../config/db';
import { reportService } from './report.service';

// ──────────────────────────────────────────────────────────────
// Defensive date helper — payload from BullMQ is JSON-serialized,
// so Date fields arrive as ISO strings, not Date objects.
// ──────────────────────────────────────────────────────────────
function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function ymd(v: any): string {
  const d = toDate(v);
  return d ? d.toISOString().split('T')[0] : '-';
}

function thDate(v: any, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString('th-TH', opts) : '-';
}

function thDateLong(v: any): string {
  return thDate(v, { day: 'numeric', month: 'long', year: 'numeric' });
}

// ──────────────────────────────────────────────────────────────
// Simple Handlebars-like interpolation: {{path.to.field}}
// Returns '-' for missing values. Auto-formats Date-ish strings
// in scheduledDate / completedDate / oldDate / newDate keys.
// Supported helpers (one only): {{thaiDate plan.scheduledDate}}
// ──────────────────────────────────────────────────────────────
function getNested(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function isDateLike(key: string): boolean {
  return /[Dd]ate$/.test(key);
}

const WORK_SCOPE_LABELS: Record<string, string> = {
  INSTALL_CAMERA: 'Install Camera',
  INSTALL_LAN: 'Install LAN',
  INSTALL_POE: 'Install POE',
  CALIBRATION: 'Calibration',
  TESTING: 'Testing',
  CLOUD_SETUP: 'Cloud Setup',
  MAINTENANCE: 'Maintenance',
};

function formatArrayValue(arr: any[], lastKey: string): string {
  if (!Array.isArray(arr) || arr.length === 0) return '-';
  // Special-case: workScope → look up labels
  if (lastKey === 'workScope') {
    return arr.map(s => WORK_SCOPE_LABELS[s] || s).join(', ');
  }
  return arr.map(v => (v === null || v === undefined ? '-' : String(v))).join(', ');
}

function interpolateTemplate(template: string, payload: any): string {
  // Supports {{path}} and {{thaiDate path}} and {{thaiDateLong path}}
  return template.replace(/\{\{\s*([\w.]+)(?:\s+([\w.]+))?\s*\}\}/g, (_match, helperOrPath, maybePath) => {
    const isHelper = !!maybePath;
    const path = isHelper ? maybePath : helperOrPath;
    const helper = isHelper ? helperOrPath : '';
    const val = getNested(payload, path);

    if (val === undefined || val === null || val === '') return '-';

    // Helper-driven formatting
    if (helper === 'thaiDate') return thDate(val);
    if (helper === 'thaiDateLong') return thDateLong(val);
    if (helper === 'ymd') return ymd(val);

    // Auto-format date-ish keys
    const lastKey = path.split('.').pop() || '';
    if (isDateLike(lastKey) && (typeof val === 'string' || val instanceof Date)) {
      return thDateLong(val);
    }

    if (Array.isArray(val)) return formatArrayValue(val, lastKey);
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });
}

// ──────────────────────────────────────────────────────────────
// Main entry
// Custom templateBody (if set) takes precedence — uses
// interpolation against the full payload. Otherwise built-in
// defaults render.
// ──────────────────────────────────────────────────────────────
export async function renderTemplate(rule: NotificationRule, payload: any): Promise<string> {
  // Custom template wins when provided
  if (rule.templateBody && rule.templateBody.trim().length > 0) {
    try {
      return interpolateTemplate(rule.templateBody, payload);
    } catch (err) {
      // Fall through to default if interpolation fails
      console.warn('[notify] custom template interpolation failed:', err);
    }
  }

  switch (rule.trigger) {
    case 'DAILY_AT': return renderDailyBrief(toDate(payload.date) || new Date(), false);
    case 'EVENING_DAY_BEFORE': return renderDailyBrief(toDate(payload.date) || new Date(), true);
    case 'WEEKLY_AT': return renderWeeklyReport(toDate(payload.weekStart) || new Date());
    case 'STATUS_CHANGE': return renderStatusChange(payload.plan, payload.condition);
    case 'READINESS_READY': return renderReadinessReady(payload.plan);
    case 'NOT_READY_NEAR': return renderNotReadyNear(payload.plan, rule.daysAhead || 3);
    case 'CAPACITY_OVERFLOW': return renderCapacityOverflow(payload);
    case 'RESCHEDULED': return renderRescheduled(payload.plan, payload.oldDate, payload.newDate, payload.isFirstTime);
    case 'TEAM_CHANGED': return renderTeamChanged(payload.plan, payload.oldTeam, payload.newTeam, payload.isFirstAssign, payload.isUnassigned);
    case 'PLAN_CREATED': return renderPlanCreated(payload.plan);
    case 'PHOTO_UPLOADED': return renderPhotoUploaded(payload.plan, payload.photo, payload.uploadedBy);
    default: return rule.templateBody || 'No template';
  }
}

async function renderDailyBrief(date: Date, isDayBefore: boolean): Promise<string> {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);

  const teams = await prisma.team.findMany({ where: { isActive: true } });
  const dateLabel = thDate(date);
  const prefix = isDayBefore ? 'พรุ่งนี้' : 'วันนี้';

  let msg = `🗓 *${prefix} ${dateLabel}*\n━━━━━━━━━━━━━\n\n`;

  for (const team of teams) {
    const plans = await prisma.installationPlan.findMany({
      where: { teamId: team.id, scheduledDate: { gte: start, lte: end } },
      include: { customer: true },
      orderBy: { storeName: 'asc' },
    });
    msg += `*${team.name}* · ${plans.length} jobs\n`;
    if (plans.length === 0) msg += '  (no jobs)\n';
    else plans.forEach((p, i) => {
      msg += `${i + 1}. ${p.customer.customerCode} · ${p.storeName}\n`;
      msg += `   📍 ${p.province || '—'} · 📷 ${p.sensorCount}\n`;
    });
    msg += '\n';
  }
  return msg.trim();
}

async function renderWeeklyReport(weekStart: Date): Promise<string> {
  const report = await reportService.getWeeklySummary(weekStart);
  const s = report.stats;
  let msg = `📊 *Weekly report*\nWeek of ${ymd(weekStart)}\n━━━━━━━━━━━━━\n\n`;
  msg += `Plans: *${s.total}* · Completed: *${s.completed}* (${s.completionRate}%)\n`;
  msg += `Sensors: *${s.completedSensors} / ${s.totalSensors}*\n\n*By customer:*\n`;
  report.byCustomer.forEach((b: any) => msg += `• ${b.code} · ${b.completed}/${b.total}\n`);
  return msg + '\n📎 Excel attached';
}

function renderStatusChange(plan: any, condition: string): string {
  if (!plan) return `Status change → ${condition}`;
  if (condition === 'CONFIRMED') {
    return `✅ *Plan confirmed*\n━━━━━━━━━━━━━\n${plan.storeName}\nDate: ${ymd(plan.scheduledDate)}\nTeam: ${plan.team?.name || 'TBA'}`;
  }
  if (condition === 'COMPLETED') {
    return `🎉 *Installation completed*\n━━━━━━━━━━━━━\n${plan.storeName}\n📎 Handover document available`;
  }
  return `Status: ${plan.storeName} → ${condition}`;
}

function renderReadinessReady(plan: any): string {
  if (!plan) return '🟢 Branch ready';
  return `🟢 *สาขาพร้อมติดตั้งแล้ว*\n━━━━━━━━━━━━━\n${plan.storeName}\n${plan.customer?.customerCode || ''}\nNote: ${plan.detail || '-'}`;
}

function renderNotReadyNear(plan: any, days: number): string {
  if (!plan) return '⚠️ Not ready warning';
  return `⚠️ *Not ready warning*\n━━━━━━━━━━━━━\n${plan.storeName}\nScheduled: ${ymd(plan.scheduledDate)} (in ${days} days)\nNote: ${plan.detail || '-'}\n\n→ Action required`;
}

function renderCapacityOverflow(p: any): string {
  return `🚨 *Capacity exceeded*\n━━━━━━━━━━━━━\n${p.date} · ${p.region}: ${p.used} / ${p.cap}\n→ Reschedule needed`;
}

function renderRescheduled(plan: any, oldDate: any, newDate: any, isFirstTime: boolean): string {
  if (!plan) return '📅 Schedule changed';
  const customer = plan.customer?.customerName || plan.customer?.customerCode || '';
  const branch = plan.branchName ? ` สาขา ${plan.branchName}` : '';
  const teamLine = plan.team?.name ? `\nTeam: ${plan.team.name}` : '';

  if (isFirstTime) {
    return `📅 *Plan scheduled*\n━━━━━━━━━━━━━\n${customer} · ${plan.storeName}${branch}\nวันที่ติดตั้ง: ${thDateLong(newDate)}${teamLine}`;
  }
  return `📅 *Plan rescheduled*\n━━━━━━━━━━━━━\n${customer} · ${plan.storeName}${branch}\nจากเดิม: ~${thDateLong(oldDate)}~\nเป็น: *${thDateLong(newDate)}*${teamLine}`;
}

function renderTeamChanged(plan: any, oldTeam: any, newTeam: any, isFirstAssign: boolean, isUnassigned: boolean): string {
  if (!plan) return '👥 Team changed';
  const customer = plan.customer?.customerName || plan.customer?.customerCode || '';
  const branch = plan.branchName ? ` สาขา ${plan.branchName}` : '';
  const dateLine = plan.scheduledDate ? `\nวันติดตั้ง: ${thDateLong(plan.scheduledDate)}` : '';

  if (isFirstAssign) {
    return `👥 *Plan assigned*\n━━━━━━━━━━━━━\n${customer} · ${plan.storeName}${branch}\nทีมที่ได้รับมอบหมาย: *${newTeam?.name || '-'}*${dateLine}`;
  }
  if (isUnassigned) {
    return `❌ *Plan unassigned*\n━━━━━━━━━━━━━\n${customer} · ${plan.storeName}${branch}\nปลดออกจากทีม: ~${oldTeam?.name || '-'}~${dateLine}\n→ รอมอบหมายใหม่`;
  }
  return `🔄 *Plan reassigned*\n━━━━━━━━━━━━━\n${customer} · ${plan.storeName}${branch}\nจากทีม: ~${oldTeam?.name || '-'}~\nเป็นทีม: *${newTeam?.name || '-'}*${dateLine}`;
}

function renderPlanCreated(plan: any): string {
  if (!plan) return '🆕 Plan created';
  const customer = plan.customer?.customerName || plan.customer?.customerCode || '';
  const branch = plan.branchName ? ` สาขา ${plan.branchName}` : '';
  const dateLine = plan.scheduledDate
    ? `\nวันติดตั้ง: ${thDateLong(plan.scheduledDate)}`
    : '\nยังไม่กำหนดวันติดตั้ง';
  const teamLine = plan.team?.name ? `\nทีม: ${plan.team.name}` : '\nยังไม่มอบหมายทีม';
  const sensorLine = plan.sensorCount ? `\nจำนวนกล้อง: ${plan.sensorCount}` : '';
  return `🆕 *แผนใหม่ถูกสร้าง*\n━━━━━━━━━━━━━\n${customer} · ${plan.storeName}${branch}${dateLine}${teamLine}${sensorLine}`;
}

const PHOTO_CATEGORY_LABELS: Record<string, string> = {
  BEFORE: 'ก่อนติดตั้ง',
  DURING: 'ระหว่างติดตั้ง',
  AFTER: 'หลังติดตั้ง',
  EQUIPMENT: 'อุปกรณ์',
  ISSUE: 'ปัญหา',
  HANDOVER: 'ส่งมอบ',
  OTHER: 'อื่นๆ',
};

function renderPhotoUploaded(plan: any, photo: any, uploadedBy: any): string {
  if (!plan) return '📷 Photo uploaded';
  const customer = plan.customer?.customerName || plan.customer?.customerCode || '';
  const branch = plan.branchName ? ` สาขา ${plan.branchName}` : '';
  const cat = PHOTO_CATEGORY_LABELS[photo?.category] || photo?.category || '-';
  const caption = photo?.caption ? `\nคำอธิบาย: ${photo.caption}` : '';
  const uploader = uploadedBy?.fullName ? `\nอัพโหลดโดย: ${uploadedBy.fullName}` : '';
  return `📷 *รูปภาพใหม่*\n━━━━━━━━━━━━━\n${customer} · ${plan.storeName}${branch}\nหมวดหมู่: ${cat}${caption}${uploader}`;
}

