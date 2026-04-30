# API Reference

All endpoints require `Authorization: Bearer <token>` except `/api/auth/login` and `/health`.

## Auth

- `POST /api/auth/login` — body: `{ email, password }` → `{ token, user }`

## Master data

- `GET /api/master/customers`
- `GET /api/master/departments`
- `GET /api/master/teams`

## Installation plans

- `GET /api/installation-plans` — query: `page, limit, customerId, departmentId, storeRegion, readiness, planStatus, teamId, scheduledFrom, scheduledTo, search`
- `GET /api/installation-plans/:id`
- `GET /api/installation-plans/statistics?storeRegion=&from=&to=`
- `POST /api/installation-plans` — admin/PM only
- `PUT /api/installation-plans/:id`
- `PATCH /api/installation-plans/:id/reschedule` — body: `{ newDate }`
- `DELETE /api/installation-plans/:id` — admin only
- `POST /api/installation-plans/bulk-import/validate` — dry run preview
- `POST /api/installation-plans/bulk-import` — actual import

## Capacity

- `GET /api/capacity/daily/:date` — date in YYYY-MM-DD
- `GET /api/capacity/heatmap?year=&month=`
- `GET /api/capacity/conflicts?from=&to=`

## Reports

- `GET /api/reports/weekly?weekStart=`
- `GET /api/reports/monthly?year=&month=`
- `GET /api/reports/export?format=xlsx|pdf&period=weekly|monthly&weekStart=&year=&month=` — downloads file

## Notifications

- `GET /api/notifications/rules`
- `PATCH /api/notifications/rules/:id/toggle`
- `POST /api/notifications/test` — body: `{ recipient: "PM Group" }`
- `GET /api/notifications/logs`
