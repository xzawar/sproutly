# Sproutly — Final project report

## Abstract

Sproutly coordinates personal plant information, recurring care, observations and local weather. It replaces a static checklist with timezone-aware due dates and a durable care history. The revision adds every-N-days schedules, selective restore, growth/photo journals, bright light-mode presentation and a change-only data cache. It deliberately distinguishes estimates from actual care and rain skips from completed watering.

## Problem and objectives

Repeated page/image loading interrupts use; ambiguous watering notes are not executable schedules; archived plants need a safe return path. Objectives are clear scheduling, informative cards, accessible responsive navigation without breadcrumbs, less redundant data transfer, and safe weather-assisted decisions. The board also requires authentication, authorization, reports and deployment deliverables.

## Method

The original source was preserved and revised in a separate copy. Existing SQL/RLS/atomic occurrence resolution were retained. Prisma was introduced behind verified Supabase identity rather than as a privileged RLS bypass. New growth/photo models and an owner-scoped invalidation log were added in migration 002. A persistent workspace layout merges delta rows instead of refreshing the whole app every minute. Public offline assets are intentionally separated from private data caching.

## Implementation

- Next.js, React, strict TypeScript, Tailwind/CSS design tokens, Zod.
- Supabase Auth password hashing/session/recovery; Postgres constraints/RLS; private owner-folder Storage.
- Prisma transactions execute under authenticated role with verified transaction-local UID.
- Plant archive/selective restore; day-based routines; complete/skip row locks and stale due-date checks.
- Filtered calendar, due statuses, activity colours/emojis, inbox and opt-in open-tab reminders.
- Growth measurements, exact tables, actual elapsed-day height chart, dated photo gallery.
- Open-Meteo current/seven-day forecast with explicit location permission/manual fallback. Rain suggestions require fresh matching-day evidence and user confirmation.
- Stable private image endpoints; public cache-first assets; offline fallback after worker activation. No offline writes.

## Evaluation

Automated date/validation/demo and real-migration PGlite tests check arithmetic, RLS, constraints, archive/restore, growth/photos and delta policies. Browser tests cover desktop/mobile screens and workflow integration in the local demo, with a deterministic weather mock for repeatable rain tests. See TEST-REPORT for actual current totals. Mocked browser weather is not a live provider test. No real production Auth/email/Storage/Prisma service has been configured in this sandbox.

## Risks and limitations

Forecasts are not soil sensors; indoor plants are excluded from rain advice. Browser notifications are best-effort while a tab is open. Private HTTP caches cannot be remotely erased; clear-site-data support varies. Offline fallback is public-only and not a fully offline garden editor. Initial snapshots are unpaginated for small personal gardens; sync pages are bounded to 2,000 events and the append-only log requires monitoring. Global revision serialization is conservative and may limit write throughput. Storage cleanup is not transactionally coupled to DB changes. Operator-managed auth rate limits, email, backups, observability and hosting remain necessary.

## Conclusion and remaining acceptance

The revised source is a locally testable full-stack implementation and a browser-only backup demo. It is not yet a deployed production service. Final acceptance requires authorized GitHub/Vercel/Supabase configuration, real-service testing, target-device checks and presentation practice. No pending external item is represented as completed merely because code exists.

## References

- User-supplied Trello JSON export: project requirement cards.
- https://sweet-tape.com/ — requested visual inspiration, not copied source/assets.
- https://open-meteo.com/en/docs — weather API contract.
- https://supabase.com/docs — Auth, Storage and RLS deployment configuration.
- https://www.prisma.io/docs — Prisma/Postgres integration.
