# Sproutly verification report

Verified locally on 2026-10-17 using Node 24.14.1 and sandbox Chromium. This report is not a security certification or evidence of a deployed Supabase project.

## Final results

| Check                             | Result                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `npm test`                        | **44 passed**, 0 failed/skipped/cancelled                                          |
| `npm run test:browser`            | **55 checks passed** against the production build                                  |
| `npm run typecheck`               | Passed, strict TypeScript                                                          |
| `npm run lint`                    | Passed                                                                             |
| `npm run format:check`            | Passed                                                                             |
| `npm run build`                   | Passed, including Prisma client generation                                         |
| `npm audit --json`                | 0 reported vulnerabilities at verification time                                    |
| Live Open-Meteo proxy smoke check | HTTP 200; current conditions and seven forecast days for sample London coordinates |

Exact browser check names and timestamp are in `browser-test-results.json`. Logs and audit output are in `verification/`. Counts reflect test-runner tests/checks, not a claim of exhaustive coverage. Advisory results can change.

## What was exercised

- Date arithmetic, timezone/DST, end dates, monthly clamping for legacy schedules, stale due dates and one outstanding overdue occurrence.
- **Actual migrations 001 and 002 in PGlite**, with stand-in Supabase auth/storage schemas: RLS and column permissions; owner/admin isolation; immutable history; atomic complete/skip; rollback; archive; in-use categories; Storage policies; anonymous/disabled access. New tests include selective restore/fresh due dates, cross-owner rejection, growth validation, photo ownership/source constraints and delta-event policies.
- Desktop **1440 × 1000** and mobile **390 × 844**: auth setup states, password eyes, primary demo routes, drawer, calendar month/week/day and filters, plant/routine editing, every-N-days intervals, complete/skip/history, category errors, profile/timezone, empty search, growth CRUD/chart/photo URLs, archive/selective restore and explicit rain-skip confirmation.
- Browser weather uses a deterministic fixture for repeatable rain testing. Separately, the real `/api/weather` route successfully fetched Open-Meteo current/seven-day data; this does not verify actual user geolocation or a deployed site.
- Offline full navigation reached the cached public fallback after service-worker activation. No offline write queue is implemented.
- Opt-in and cross-tab reminder suppression use a **simulated Notification API**, not OS notification delivery. The inbox remains available without notification permission.
- No uncaught page errors in the browser suite. Screenshot helpers checked page-level horizontal overflow. An OS dark preference was explicitly asserted to retain the approved light colour scheme.

## Visual review and artifacts

68 screenshots are included under `screenshots/`. Principal screens were individually reviewed: desktop overview, calendar, login, growth and weather; mobile overview, plants/detail, login, schedule, calendar, growth, weather, inbox, restore, rain confirmation and offline fallback. This is a representative visual review, not a claim that all 68 images or all devices received manual inspection.

Refinements from review: aligned growth/forecast cards; consistent panel padding; separated forgot-password link; wrapped calendar status text; responsive chart coordinates/fonts and short mobile date labels; lazy-gallery images scrolled into view before capture. The growth SVG title hydration issue was fixed and the full suite rerun without page errors.

The editable ten-slide presentation, its PDF rendering, and ER/use-case diagrams were inspected individually. Presentation layout validation reported no issues/warnings. Diagram DOT sources and SVG/PNG outputs are included.

## Explicitly not verified / production acceptance gates

No real Supabase credentials/project access were provided. The hosted Prisma connection, migrations on that project, Auth/email confirmation/recovery/session refresh, live private Storage uploads/HTTP policies and two-user privacy through the real service APIs still require the checklist in README and DEMO-RUNBOOK. PGlite executes the SQL policies but does not replace those services or prove production concurrency/load behavior.

The normal authenticated per-user snapshot/delta/session cache and private-image HTTP caching are implemented, but a real-account network trace and logout/cache behavior on target browsers remain live acceptance gates. Demo browser tests do not prove that integration. The public offline fallback was exercised directly.

No GitHub push or Vercel deployment was created. Real geolocation permissions, OS notification delivery, target-device coverage, backups, SMTP/rate limits, production monitoring and presentation rehearsal remain external acceptance work. The local demo is fictional browser data, not production authentication.
