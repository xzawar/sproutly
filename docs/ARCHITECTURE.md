# Architecture

## Request boundaries

Browser → Next.js App Router + Server Actions → Supabase Auth verification → Prisma transaction → `SET LOCAL ROLE authenticated` + transaction-local UID claims → PostgreSQL RLS → owner rows. Supabase Auth owns password hashing, sessions and recovery; no application password table exists. Supabase Storage owns private files, with owner folder policies. Prisma models are a typed mapping, **SQL migrations own database security and constraints**.

Browser → `/api/weather` → rounded/validated coordinates → Open-Meteo (10-minute upstream cache). Weather is advisory and cannot mutate care on its own.

## Data model

Auth user → one profile. Profile → owned plants, schedules, care history, measurements and photos. A category is optional on a plant. `(plant_id,user_id)` composite foreign keys prevent cross-owner relationships. Schedules use an interval and one current due date. Resolution inserts an immutable occurrence and advances the routine atomically. Photos reference a private object or an HTTPS URL, never both. Sync events are invalidations, not business records.

## Synchronization

Initial snapshot + revision cursor are read in one Repeatable Read transaction. Changes read up to 2,000 visible events after the cursor, collapse per-row events, fetch changed rows only, return deleted IDs and the last processed cursor. Additional pages are obtained on following syncs. Event allocation uses a transaction advisory lock so committed revisions cannot be skipped by a later commit. Clients merge by UUID. A private per-user tab cache and stable asset URLs avoid repeat full loads. Synchronization is eventually consistent; log retention is unlimited until a future explicit expiry/resnapshot protocol is implemented. A heavily contended global change lock is a scaling limit; monitor before high-volume deployment.

## Offline and lifecycle

Service worker caches public build/static assets and offline fallback, never authenticated HTML/API/private photos. In-memory state survives Next navigation; sessionStorage survives same-tab reload. Mutations require an online connection. Auth server verification precedes cache restoration. Sign out clears local session caches and sends Clear-Site-Data. HTTP private image caching depends on browser support for clearing and is not remote revocation.

## Security controls and limitations

- RLS for all application tables; admin directory access does not grant garden access.
- Supabase session verification before DB transactions; active-profile check.
- Zod validation + PostgreSQL constraints + owner path checks + upload signature validation.
- Atomic row-locked resolution and selective restore. No permanent plant delete.
- Restricted role/status/email column grants; cannot self-promote via profile save.
- Same-origin Server Actions and logout origin check; no service-role credentials in browser bundles.
- CSP, nosniff, frame denial; CSP allows inline Next bootstrapping and is not a nonce-based strict policy.
- Auth rate limits, SMTP, operational backup/monitoring and secrets belong to the production operator.
- Storage cleanup is best-effort; browser reminders are not guaranteed background delivery.

## Deployment topology

GitHub source → Vercel build (`prisma generate && next build`) → Node runtime → Supabase transaction pooler/Postgres + Auth + Storage. Configure DATABASE_URL, DIRECT_URL and public Supabase URL/key in each intended environment. Preview and production should use separate/disposable data or clearly controlled access. Do not apply development seeds to production by accident. See DEMO-RUNBOOK for acceptance checks.
