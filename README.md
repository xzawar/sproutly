# Sproutly 🌱

Bright, light-mode plant care: Next.js + React + TypeScript, Prisma, Supabase Auth/Postgres/Storage and Open-Meteo. Sweet Tape-inspired lime `#B6FE00`, forest `#034102`, paper backgrounds and colourful activities. **No breadcrumbs.**

## Run the local backup demo

Node 22+ (tested with Node 24). No accounts or secrets needed:

```sh
npm ci
npx prisma generate
npm run build
npm start
# http://localhost:3000/demo/dashboard
```

The demo is fictional, isolated browser-local data. It supports plant and routine editing, every-N-days schedules, complete/skip, archive/selective restore, growth measurements/charts, dated photo URLs, calendar filters and notifications. Reset from Profile. Uploads, real account access and private Storage require the live setup below. Weather requires network access and either location permission or manual coordinates. Rain skip is always confirmed, never automatic.

## Connect Supabase + Prisma

1. Back up any existing database. On a new project apply `supabase/migrations/001_initial.sql`, then `002_sproutly.sql` **once, in order** in Supabase SQL Editor. For an existing original app apply only 002 after backup. Do not use `prisma db push` or generate a replacement migration: SQL contains security policies/functions that Prisma cannot represent.
2. Copy `.env.example` to `.env.local`. Set the public Supabase URL/key and server-only `DATABASE_URL` / `DIRECT_URL`. Use the Supabase dashboard's connection strings, URL-encode password characters and require SSL. Runtime can use the transaction pooler; DIRECT_URL must use direct/session connectivity. Never commit secrets.
3. The runtime DB login must be able to `SET ROLE authenticated`. Every Prisma app operation verifies Supabase Auth, starts a transaction, sets that role and transaction-local verified UID claims, then checks the active profile. **Never call the exported Prisma client for app rows outside `withUser`.** A dedicated least-privilege login is recommended; have the database administrator grant it membership in `authenticated`. Do not grant it schema-owner, service_role or superuser privileges. Transaction role/claims reset on pool return.
4. Configure Supabase Auth email/password, confirmation, SMTP, rate limits and minimum password length 12. Set Site URL and approved redirect URLs to your local/production origin. Configure these email template links:

```html
<!-- Confirm signup -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup"
  >Confirm account</a
>
<!-- Reset Password -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery"
  >Reset password</a
>
```

5. `npx prisma generate`, build and run. Register, confirm, sign in. Set profile timezone (IANA). Promote a verified intended administrator manually in trusted SQL if needed:

```sql
update public.profiles set role='admin' where lower(email)=lower('YOUR_ADMIN_EMAIL');
```

Admins manage categories and read the user directory, **not other users' gardens**. No web app service-role key is required. Optional `scripts/seed.ts` is a privileged disposable-project tool only; review it before running and remove seed credentials afterward.

## Main routes

`/login`, `/register`, `/forgot-password`, `/reset-password`; authenticated `/dashboard`, `/plants`, `/plants/new`, `/plants/:id`, `/plants/:id/edit`, `/plants/:id/schedules/new`, `/schedules/:id/edit`, `/tasks`, `/calendar`, `/history`, `/growth`, `/weather`, `/profile`, `/admin/users`, `/admin/categories`. Workspace routes have equivalent `/demo` paths.

## Scheduling and restore

- Watering/fertilizing **requirements are notes**, not schedules. Use the plant's **Set watering schedule** / **Set fertilizing schedule** buttons, enter **Repeat every N days**, next date and optional end date. Notes are optional. New/edited schedules use days only (1–3650). Legacy database weeks/months remain readable and resolve with original arithmetic until edited.
- Complete/skip is available when due, using the profile timezone. The next due date starts from the actual action day, not a stale overdue day. End dates are inclusive. History is immutable. A row lock and expected-due check prevent duplicate/stale submission.
- Calendar future occurrences are estimates, not stored commitments. Overdue means one outstanding occurrence, not an invented backlog. Plant/activity/status filters work on month/week/day views.
- Archive preserves history and stops routines. Open Archived in My plants, select the plant and **Restore plant**. Explicitly choose routines to resume. Selected routines restart one interval from today; unselected routines stay stopped. Ended routines cannot resume past their end date.

## Cache and offline contract

- Persistent workspace layout retains the in-memory data across navigation. Per-user **sessionStorage** restores the last view in the same tab after reload; identity is verified on the server before using that cache.
- First `/api/sync` returns a snapshot and revision cursor. Later syncs on focus/online/every 60 seconds and after mutation return only changed rows and deletion IDs. No periodic `router.refresh`, full workspace polling or churned signed image URLs. The small verified profile is returned each time. The revision log is serialized with commit ordering and protected by RLS. Do not prune it without a cursor-expiry/full-resync protocol.
- Private uploaded images use stable authenticated `/api/image?path=...` URLs and browser-private immutable caching (unique non-overwritten paths). Public assets use cache-first service worker/static caching. External image cache behavior depends on its host.
- No private page HTML, API responses or private images are put into service-worker Cache Storage. A network-failed **full navigation** shows `offline.html` after one successful online visit/worker activation. No offline editing or sync queue. A still-open page can display its last cached view; reconnect to save.
- Logout clears Sproutly session caches and requests Clear-Site-Data cache/storage. Browser support varies; do not share a browser profile for sensitive gardens. Disabled accounts cannot fetch new data, but already downloaded data cannot be remotely erased. Never call this a fully offline/private-data PWA.

## Weather and notifications

- Server `/api/weather` validates and rounds coordinates to 0.01°, requests Open-Meteo seven-day/current temperature/humidity/rain and caches upstream responses for 10 minutes. Data remains in this tab's session cache; Forget location removes it. No coordinate logging is implemented. Hosting/provider access logs may still contain URL parameters.
- Only outdoor/exposed due watering gets a rain suggestion, when a forecast matching the profile date is fresh ≤30 min, probability ≥60% and rain + showers ≥1 mm. Inspect soil and exposure, then confirm **Skipped — rain**. Weather failures never change a task. Forecast timing can differ from the profile timezone; no matching date means no suggestion.
- In-app inbox includes overdue, due and selected upcoming horizon. Mark all read and choose 0/1/2/3/7 days ahead. Browser notifications are opt-in, deduplicated by user/occurrence/day; Web Locks coordinate tabs. They work **while a tab is open**; no push/cron/email delivery is claimed. Permission denial/unsupported browsers leave the in-app inbox usable.

## Growth and images

Dated height/leaf observations can be added, edited and deleted; filter by plant/date. Height charts use actual elapsed days, zero baseline and exact accessible tables. Fewer than four observations show the table instead of implying a trend. Demo points are illustrative. Dated/captioned photo gallery is newest-first. Private uploads: JPEG/PNG/WebP, ≤5 MiB, MIME/magic-byte validation, owner-path policies. HTTPS external URLs are public to their host. Deleting/replacing images attempts best-effort cleanup only when no plant/photo references the object; storage/database changes are not one transaction.

## Verify and deliver

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
# another terminal; Chromium installed locally
CHROMIUM_PATH=/usr/local/bin/chromium npm run test:browser
```

See `docs/TEST-REPORT.md` for current evidence and unverified live integrations; `docs/BOARD-AUDIT.md` for requirement mapping; `docs/ARCHITECTURE.md`, diagrams and `docs/FINAL-REPORT.md` for project documentation; `docs/DEMO-RUNBOOK.md` for presentation steps and production acceptance gates. Source contains no deployed URL or configured live project. GitHub/Vercel deployment, live email/Storage/Auth/Prisma connectivity, and production testing remain pending account access.

### Dependency note

Prisma 6.19 is pinned. Its config-only transitive `effect` and `deepmerge-ts` dependencies are overridden to patched versions; client generation, checks and build passed with those overrides. Review and retest overrides when upgrading Prisma.
