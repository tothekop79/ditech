import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

class TelegramService {
  private bot: TelegramBot | null = null;

  private getBot(): TelegramBot {
    if (!this.bot) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');
      this.bot = new TelegramBot(token, { polling: false });
    }
    return this.bot;
  }

  async sendMessage(chatId: string, text: string) {
    return this.getBot().sendMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: true });
  }

  async sendDocument(chatId: string, buffer: Buffer, filename: string, caption?: string) {
    return this.getBot().sendDocument(chatId, buffer, { caption, parse_mode: 'Markdown' }, { filename, contentType: 'application/octet-stream' });
  }

  /**
   * Send a photo from a local file path with optional caption (Markdown supported).
   * Returns true on success, throws on Telegram error.
   */
  async sendPhoto(chatId: string, filePath: string, caption?: string): Promise<boolean> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Photo file not found: ${filePath}`);
    }
    const stream = fs.createReadStream(filePath);
    await this.getBot().sendPhoto(chatId, stream, {
      caption: caption || undefined,
      parse_mode: 'Markdown',
    });
    return true;
  }

  async testConnection(chatId: string): Promise<boolean> {
    try {
      await this.sendMessage(chatId, '🤖 Test message from DITECH planner bot');
      return true;
    } catch {
      return false;
    }
  }

  isConfigured(): boolean {
    return !!process.env.TELEGRAM_BOT_TOKEN;
  }
}

export const telegramService = new TelegramService();
