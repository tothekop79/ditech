# Vion Device Monitor — Sprint 1 install (atomic steps, verify each)

Scope: poll device status from both Vion servers every 5 min → DB history → alert state machine → Telegram on transitions → `/api/monitor/*` for the dashboard.
Verified against live API 2026-09-05: 222 sites / 540 devices.

## 0. Rotate credentials first
Both appkey/password pairs were pasted into chat. Ask the vendor for new passwords before this goes live.

## 1. Files → repo (on 192.168.1.120, in /home/ditech/ditech-planner)
```
backend/src/integrations/vion/vion.client.ts      NEW
backend/src/services/deviceMonitor.service.ts     NEW
backend/src/queues/deviceMonitor.queue.ts         NEW
backend/src/routes/monitor.routes.ts              NEW
backend/prisma/schema.prisma                      APPEND monitor.prisma.snippet + add `monitoredSites MonitoredSite[]` to model Customer
```
Before creating: `grep -rn "monitoredSite\|VionClient" backend/src -l` — must be empty (lesson #45).

## 2. Env — MUST go in docker-compose.yml `environment:` block, not only .env (lesson #67)
```yaml
      VION_MALL_BASE_URL:    ${VION_MALL_BASE_URL:-http://mall.vion-cloud.com:18080}
      VION_MALL_APPKEY:      ${VION_MALL_APPKEY}
      VION_MALL_USERNAME:    ${VION_MALL_USERNAME}
      VION_MALL_PASSWORD:    ${VION_MALL_PASSWORD}
      VION_RETAIL_BASE_URL:  ${VION_RETAIL_BASE_URL:-http://retail.vionyun.com:18085}
      VION_RETAIL_APPKEY:    ${VION_RETAIL_APPKEY}
      VION_RETAIL_USERNAME:  ${VION_RETAIL_USERNAME}
      VION_RETAIL_PASSWORD:  ${VION_RETAIL_PASSWORD}
      VION_POLL_INTERVAL_MS: ${VION_POLL_INTERVAL_MS:-300000}
      VION_OFFLINE_GRACE_MS: ${VION_OFFLINE_GRACE_MS:-600000}
      VION_POLL_CONCURRENCY: ${VION_POLL_CONCURRENCY:-4}
      VION_MONITOR_ENABLED:  ${VION_MONITOR_ENABLED:-true}
```
Values go in `.env` (already git-ignored — confirm: `git check-ignore -v .env`).

## 3. Schema
```bash
docker exec ditech-planner-backend-1 npx prisma validate
docker exec ditech-planner-backend-1 npx prisma db push --skip-generate     # project convention: db push on live
docker exec ditech-planner-backend-1 npx prisma generate
docker exec ditech-planner-postgres-1 psql -U ditech -d ditech -c '\dt' | grep -E 'Monitored|Alert|DeviceStatus'   # expect 4 tables
```

## 4. Wire into server.ts (2 lines)
```ts
import monitorRoutes from './routes/monitor.routes';
import { startDeviceMonitor } from './queues/deviceMonitor.queue';
app.use('/api/monitor', authMiddleware, monitorRoutes);      // same auth middleware the other routes use
startDeviceMonitor().catch(e => console.error('[monitor] start failed', e));
```
Telegram: in `deviceMonitor.service.ts` the notifier is a stub. Wire it once:
```ts
import { setNotifier } from './services/deviceMonitor.service';
setNotifier((text) => telegramService.send(text));   // whatever dispatchEventReportReady() uses internally
```

## 5. Restart + recreate (env changed → `up -d`, not `restart`; then restart frontend proxy — lesson #69)
```bash
docker compose up -d backend && docker compose restart frontend
docker compose logs -f backend --tail=50 | grep -E "\[monitor\]|error"
```
Expected within ~30 s: `[monitor] started`, `sync-sites {"MALL":6,"RETAIL":216}`, then `poll {...devices:540...}`.

## 6. Verify
```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@ditech.co.th","password":"Admin123!"}' | jq -r .data.token)
curl -s http://localhost:5000/api/monitor/overview -H "Authorization: Bearer $TOKEN" | jq '.data.devices, (.data.sites|length)'
# expect devices.total≈540, online≈493, sites=222
curl -s 'http://localhost:5000/api/monitor/alerts' -H "Authorization: Bearer $TOKEN" | jq '.data|length'
# first poll opens 0 alerts (baseline); alerts open only on CHANGE from now on.
```
To seed alerts for currently-offline devices on first run, set every device's initial status to 1 before the first poll is NOT recommended — instead run:
```sql
INSERT INTO "Alert"(id,type,severity,state,"siteId","deviceId",message,"openedAt")
SELECT gen_random_uuid(),'OFFLINE','WARN','OPEN',"siteId",id, name||' offline at baseline',now()
FROM "MonitoredDevice" WHERE "currentStatus"=0;
```

## 7. Hide the 26 empty sites
```sql
UPDATE "MonitoredSite" s SET monitored=false
WHERE NOT EXISTS (SELECT 1 FROM "MonitoredDevice" d WHERE d."siteId"=s.id);
```

## 8. Commit
```bash
git add backend/src/integrations/vion backend/src/services/deviceMonitor.service.ts \
        backend/src/queues/deviceMonitor.queue.ts backend/src/routes/monitor.routes.ts \
        backend/prisma/schema.prisma backend/src/server.ts docker-compose.yml
git status          # read "Changes to be committed" before committing (principle #6)
git commit -m "feat(monitor): Vion device status monitor — sites/devices/alerts + repeatable poll"
```

## Not in Sprint 1 (next)
- counting ingestion (`gateHour`) → SILENT / ZERO / IMBALANCE / SPIKE checks
- ApiSource table with encrypted secrets (replaces env)
- frontend Fleet Overview page (consumes `/api/monitor/overview`)
- customer ↔ site mapping UI (try `GET /api/v2/base/groupInfo` first — vendor may already group by customer)
