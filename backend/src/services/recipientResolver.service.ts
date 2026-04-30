import { prisma } from '../config/db';

/**
 * Resolve a recipient string to a Telegram chat ID.
 *
 * Recipient strings:
 * - "PM Group"            → env: TELEGRAM_PM_GROUP_CHAT_ID
 * - "Customer Group"      → env: TELEGRAM_CUSTOMER_GROUP_CHAT_ID
 * - "Admin"               → env: TELEGRAM_ADMIN_CHAT_ID
 * - "Assigned team"       → context.plan.team.telegramChatId (auto from plan)
 * - "Team {Name}"         → team.telegramChatId where team.name matches
 *
 * @param recipient — recipient label from rule.recipients
 * @param context   — optional context (e.g. { plan }) for "Assigned team"
 */
export async function resolveRecipientChatId(recipient: string, context?: any): Promise<string | null> {
  // Built-in groups (env-driven)
  if (recipient === 'PM Group') return process.env.TELEGRAM_PM_GROUP_CHAT_ID || null;
  if (recipient === 'Customer Group') return process.env.TELEGRAM_CUSTOMER_GROUP_CHAT_ID || null;
  if (recipient === 'Admin') return process.env.TELEGRAM_ADMIN_CHAT_ID || null;

  // Auto-resolve from plan context (event-driven triggers)
  if (recipient === 'New team') return context?.newTeam?.telegramChatId || null;
  if (recipient === 'Assigned team') {
    const teamId = context?.plan?.teamId || context?.plan?.team?.id;
    if (!teamId) return null;
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { telegramChatId: true },
    });
    return team?.telegramChatId || null;
  }

  // Specific team by name — accept "Team Foo" or just "Foo"
  if (recipient.startsWith('Team ')) {
    const teamName = recipient.replace(/^Team\s+/, '');
    // Try exact match first, then with "Team " prefix
    let team = await prisma.team.findUnique({
      where: { name: teamName },
      select: { telegramChatId: true },
    });
    if (!team) {
      team = await prisma.team.findUnique({
        where: { name: recipient },
        select: { telegramChatId: true },
      });
    }
    return team?.telegramChatId || null;
  }

  return null;
}
