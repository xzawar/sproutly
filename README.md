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

## Virtual Home

Open `/demo/home` for a browser-local garden or `/home` for your signed-in workspace. From the dashboard, choose **Open Home** or the house icon beside a due plant. The viewer loads when you enter Home.

- Add an **Aloe vera** at **Kitchen countertop** or a **Rose** at **Front garden**. Saving the plant places its 3D model on the matching surface. Indoor pots stay indoors. **Dollhouse** shows the whole collection across its actual locations.
- Choose **Exterior**, **Dollhouse**, **Ground floor** or **First floor**. The location menu focuses a room or opens free exploration. Tap a visible plant or use the plant picker to find one behind a wall. Drag to orbit, pinch or scroll to zoom and use two fingers or right-drag to pan. The scene also supports arrow keys, WASD, Q/E, plus/minus and Home.
- Press **C** or choose **Walk as gardener** to move through the front door at eye level. Click the scene for mouse look, drag on touch, or turn with **J/L**. Move with **WASD**, arrow keys or the pad. Hold **Shift** to sprint. Select a plant before entering to start beside it. Press **E/F** or tap **Tend** within reach.
- In **Explore camera**, choose **Fly** to rise with **E/Space** or descend with **Q**, or choose **Follow gardener** to see your character. **Esc** releases the mouse. **C** or **Back to map** restores the exterior orbit.
- Select a plant and choose **Water** to follow the gardener to it. The recorded event updates the current routine, history and care-based health estimate. Fertilize, Prune, Mist and Inspect have distinct interactions. **Move plant** saves a location and checks for furniture, boundaries and other plants.
- **Fullscreen** keeps the floor, location and care controls available. Rendering quality can be set to **Automatic**, **Low**, **Balanced** or **Ultra**. The house, garden, gardener and species are original procedural 3D geometry with no external model downloads.

For the model registry, release checks, performance measurements and extension instructions, see the [Living Home guide](docs/LIVING-HOME.md). For remaining launch work and the recommended AI automation, see the [project review](docs/PROJECT-REVIEW.md).

## Connect Supabase + Prisma

1. Back up the target database. On a fresh project, apply `001_initial.sql`, `002_sproutly.sql`, `003_home.sql`, `004_upper_floor.sql` and `005_living_home.sql` in order from `supabase/migrations/`. On an existing project, apply only its pending files. Version 005 enables outdoor placements, atomic care visits and owner-scoped revision notifications. These SQL migrations include policies and functions outside the Prisma schema.
2. Copy `.env.example` to `.env.local`. Set the public Supabase URL/key and server-only `DATABASE_URL` / `DIRECT_URL`. Use the Supabase dashboard's connection strings, URL-encode password characters and require SSL. Runtime can use the transaction pooler; DIRECT_URL must use direct/session connectivity. Never commit secrets.
3. The runtime DB login must be able to `SET ROLE authenticated`. Every Prisma app operation verifies Supabase Auth, starts a transaction, sets that role and transaction-local verified UID claims, then checks the active profile. **Never call the exported Prisma client for app rows outside `withUser`.** A dedicated least-privilege login is recommended; have the database administrator grant it membership in `authenticated`. Do not grant it schema-owner, service_role or superuser privileges. Transaction role/claims reset on pool return.
4. Configure Supabase Auth email/password, confirmation, SMTP and rate limits. The form currently accepts six characters. If the project uses the recommended deployment setting of 12, align signup and recovery validation and help text before launch. Set Site URL and approved redirect URLs to your local/production origin. Configure these email template links:

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

`/login`, `/register`, `/forgot-password`, `/reset-password`; authenticated `/dashboard`, `/home`, `/plants`, `/plants/new`, `/plants/:id`, `/plants/:id/edit`, `/plants/:id/schedules/new`, `/schedules/:id/edit`, `/tasks`, `/calendar`, `/history`, `/analytics`, `/growth`, `/weather`, `/profile`, `/admin/users`, `/admin/categories`. Workspace routes have equivalent `/demo` paths.

## Scheduling and restore

- Watering/fertilizing **requirements are notes**, not schedules. Use the plant's **Set watering schedule** / **Set fertilizing schedule** buttons, enter **Repeat every N days**, next date and optional end date. Notes are optional. New/edited schedules use days only (1–3650). Legacy database weeks/months remain readable and resolve with original arithmetic until edited.
- Complete/skip is available when due, using the profile timezone. The next due date starts from the actual action day, not a stale overdue day. End dates are inclusive. History is immutable. A row lock and expected-due check prevent duplicate/stale submission.
- Calendar future occurrences are estimates, not stored commitments. Overdue means one outstanding occurrence, not an invented backlog. Plant/activity/status filters work on month/week/day views.
- Archive preserves history and stops routines. Open Archived in My plants, select the plant and **Restore plant**. Explicitly choose routines to resume. Selected routines restart one interval from today; unselected routines stay stopped. Ended routines cannot resume past their end date.

## Cache and offline contract

- Persistent workspace layout retains the in-memory data across navigation. Per-user **sessionStorage** restores the last view in the same tab after reload; identity is verified on the server before using that cache.
- First `/api/sync` returns a snapshot and revision cursor. Supabase Realtime and same-browser tab notifications trigger an owner-scoped delta fetch. A local mutation, focus, reconnect or the 60-second fallback also triggers it. The client drains all revision pages and applies changed rows and deletion IDs. No periodic `router.refresh`, full workspace polling or churned signed image URLs. The small verified profile is returned each time. The revision log is serialized with commit ordering and protected by RLS. Do not prune it without a cursor-expiry/full-resync protocol.
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

See `docs/LIVING-HOME.md` for this release’s verified results and open checks, and `docs/TEST-REPORT.md` for the original platform tests; `docs/BOARD-AUDIT.md` for requirement mapping; `docs/ARCHITECTURE.md`, diagrams and `docs/FINAL-REPORT.md` for project documentation; `docs/DEMO-RUNBOOK.md` for presentation steps and production acceptance gates. Source contains no deployed URL or configured live project. The GitHub repository exists. Vercel deployment status, live email/Storage/Auth/Prisma connectivity and production acceptance still need confirmation from the target environment.

### Dependency note

Prisma 6.19 is pinned. Its config-only transitive `effect` and `deepmerge-ts` dependencies are overridden to patched versions; client generation, checks and build passed with those overrides. Review and retest overrides when upgrading Prisma.
