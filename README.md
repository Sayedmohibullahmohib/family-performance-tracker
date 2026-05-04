# Kids Performance Tracker

A standalone web app for tracking children’s activities, automatically awarding points, approving tasks when needed, and redeeming points in a reward shop.

## Features

- Child dashboard with today’s activities, daily points, weekly points, total points, reward status, and encouraging messages.
- Parent/admin dashboard for activities, rewards, approvals, child progress, and reports.
- Prayer tracking for Fajr, Dhuhr, Asr, Maghrib, and Isha with partial points.
- Default activities and rewards seeded automatically.
- SQLite database with `users`, `children`, `activities`, `activity_logs`, `rewards`, `reward_redemptions`, and `point_transactions`.
- Authentication for parent/admin and child accounts.

## Demo Accounts

- Parent: `Parent Admin` / `parent123`
- Child: `Amina` / `child123`
- Child: `Yusuf` / `child123`

The login screen uses names, not email addresses. Each parent and child should have a unique login name.

## Requirements

- Node.js 20 or newer
- SQLite CLI available as `sqlite3`

This project intentionally uses no npm dependencies so it can run in very small hosting environments. The UI uses React from a CDN in `static/index.html`. For production, download and serve those React files locally or migrate the frontend to Vite.

## Run Locally

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

The SQLite database is created automatically at:

```text
data/app.db
```

## Database Tables

- `users`: parent/admin and child login accounts.
- `children`: child profiles and total point balance.
- `activities`: activity definitions with points, frequency, approval, and proof settings.
- `activity_logs`: daily activity status for each child.
- `rewards`: reward shop items.
- `reward_redemptions`: redeemed rewards and points spent.
- `point_transactions`: full point history for earned and spent points.

## Hosting Notes

Before hosting on your own domain:

1. Set a strong `TOKEN_SECRET` environment variable.
2. Change demo passwords.
3. Serve React and Babel locally or build the frontend with Vite.
4. Put the app behind HTTPS.
5. Back up `data/app.db` regularly.

## API Shape

- `POST /api/login`
- `GET /api/me`
- `GET /api/dashboard`
- `GET /api/admin`
- `GET /api/reports`
- `POST /api/activities/complete`
- `POST /api/activities`
- `PUT /api/activities/:id`
- `DELETE /api/activities/:id`
- `POST /api/rewards`
- `PUT /api/rewards/:id`
- `DELETE /api/rewards/:id`
- `POST /api/approvals`
- `POST /api/redeem`
