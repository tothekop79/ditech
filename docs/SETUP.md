# Setup notes

## Telegram bot (Phase 5)

1. Open Telegram, search `@BotFather`, send `/newbot`
2. Choose name + username, get bot token (looks like `123456789:ABC-DEF1234ghIkl`)
3. Add bot to your groups (PM Group, Customer Group, each Team)
4. Send any message in each group
5. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` in browser
6. Look for `chat.id` (negative number for groups, e.g. `-1001234567890`)
7. Copy chat IDs into `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABC-DEF...
   TELEGRAM_PM_GROUP_CHAT_ID=-1001234567890
   TELEGRAM_CUSTOMER_GROUP_CHAT_ID=-1001234567891
   TELEGRAM_ADMIN_CHAT_ID=-1001234567892
   ```
8. For per-team chat IDs, edit `Team.telegramChatId` in Prisma Studio

## Test the bot

```bash
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ditech.co.th","password":"Admin123!"}' \
  | jq -r '.data.token')

curl -X POST http://localhost:5000/api/notifications/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipient":"PM Group"}'
```

## PDF export needs Chromium

The Dockerfile installs Chromium automatically. If running outside Docker:

```bash
# macOS
brew install chromium

# Ubuntu/Debian
apt install chromium-browser

# Then set in .env:
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

## Reset database

```bash
docker compose down -v
docker compose up -d
docker compose exec backend npx prisma migrate dev --name init
docker compose exec backend npm run seed
```
