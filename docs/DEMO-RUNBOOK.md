# Demo, deployment and acceptance runbook

## Five-minute local presentation

1. Start with `npm ci`, `npx prisma generate`, `npm run build`, `npm start`. Open `/demo/dashboard`. Reset sample data in Profile first if needed.
2. Explain local fictional sample banner, bright light-only styling and no breadcrumbs. Open My plants; inspect location, category, sunlight and next watering/feeding.
3. On a plant choose Set watering schedule. Set every 6 days, next due today, optional end; notes are not required. Create a fertilizing routine separately.
4. Complete a due task with a note; show history and changed next date. Explain one overdue occurrence and estimated calendar projections. Show calendar plant/activity/status filters and mobile agenda.
5. Archive a plant; open Archived; restore and explicitly choose routines. Show fresh restart dates and preserved history.
6. Growth journal: measurements, chart, exact table and dated photo gallery. Add a measurement; do not present illustrative sample heights as real study results.
7. Weather: request location (or manual coordinates), show temperature/humidity/rain. On qualifying outdoor watering choose Skip for rain, inspect confirmation and explain “Skipped — rain”, never automatic completion. Actual weather may not qualify; use the automated fixture only for a clearly labelled test demonstration.
8. Inbox: upcoming horizon, read state, opt-in browser notification. Explain open-tab limitation.
9. After worker activation, set browser offline and perform a full navigation: fallback appears. Reconnect. Do not promise offline editing.

## Production setup (requires owner authorization)

- Choose/create GitHub repository; review diff and secret scan before initial push. Do not overwrite an existing repo blindly.
- Create/import Vercel project; Node 22+, production build `npm run build` (postinstall generates Prisma). Keep project root at source directory.
- Create/configure Supabase DB; back up existing data; apply migrations 001 then 002 once; verify role grants and private bucket.
- Add DATABASE_URL, DIRECT_URL and public Supabase URL/key using each provider's secret/environment settings, not chat or committed files. SMTP/redirect origins and Auth recovery template must match deployed origin.
- Run deployment and inspect build/runtime logs. Visit the actual public URL and complete the acceptance checklist below. No deployed URL is supplied until this happens.

## Live acceptance gates

- Two accounts + admin: signup/confirmation/login/logout/recovery/password eyes; stale/expired recovery link; disabled account.
- Prisma queries run with RLS; two accounts cannot read/write each other's plants, observations, photos or sync events; admin cannot inspect gardens.
- Create/edit plant; JPEG/PNG/WebP upload ≤5 MiB; reject spoofed MIME/SVG; stable image URL and cache hit on revisit; logout clears private state.
- Water/feeding every N days; due-only complete/skip; stale double submission; end boundary; timezone day rollover; archive/selective restore.
- Delta response empty for unchanged workspace; one row update returns that row and no full snapshot; deletion removes cached item; client navigation no full data reload; reconnect/focus refresh.
- Growth CRUD and private photo add/delete; check cleanup failures gracefully. Date filters and exact chart table match saved values.
- Calendar month/week/filters/day details at 390px and desktop; all controls keyboard reachable; modal focus trapped/Escape; errors readable.
- Live weather provider success/failure; geolocation allow/deny on HTTPS; manual fallback; indoor exclusion; stale forecast no rain skip; explicit skip confirmation.
- Notifications allow/deny/unsupported, cross-tab suppression, upcoming horizon; no claim of delivery after closing all tabs.
- Worker activates; public fallback on offline full navigation; no private data in service-worker caches; no offline writes.
- HTTPS, real domain, SMTP/rate limits, monitoring, backup restore rehearsal, dependency audit, target-device Safari/Chrome checks.

## Backup and review

Keep the source ZIP and lockfile, encrypted database backup and Storage inventory separately. The browser demo is a presentation fallback, not a production data backup. Rehearse once online and once with no network; actual weather cannot refresh offline. Final review signs off unresolved failures and external access items explicitly.
