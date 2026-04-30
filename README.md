# DITECH Installation Planner

Complete backend for managing People Counting Camera installations across multi-branch retail customers.

## Quick start

```bash
cp .env.example .env
# edit .env with your Telegram tokens (optional for phase 5)

docker compose up -d
docker compose exec backend npx prisma migrate dev --name init
docker compose exec backend npm run seed

# Backend running at http://localhost:5000
# Test:
curl http://localhost:5000/health
```

## Test credentials (after seed)

- Admin: `admin@ditech.co.th` / `Admin123!`
- PM: `pm@ditech.co.th` / `Pm123!`

## Phases included

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Foundation — Plan CRUD, master data, history | included |
| 2 | Operations — Calendar, capacity, alerts | included |
| 3 | Import — Bulk CSV/Excel | included |
| 4 | Reports — Weekly summary, Excel export | included |
| 5 | Notifications — Telegram bot, cron, events | included |

## Useful commands

```bash
# View logs
docker compose logs -f backend

# Prisma Studio (DB GUI)
docker compose exec backend npx prisma studio

# Reset database
docker compose down -v && docker compose up -d

# Run tests
docker compose exec backend npm test
```

## Architecture

```
backend/
  src/
    config/         — db, redis, env
    types/          — TypeScript interfaces
    middlewares/    — auth, validation, error handling
    services/       — business logic
    controllers/    — request handlers
    routes/         — express routers
    queues/         — bullmq workers
    templates/      — notification message templates
    utils/          — helpers
  prisma/
    schema.prisma
    seed.ts
```

See `docs/` for detailed API reference and migration guide.
