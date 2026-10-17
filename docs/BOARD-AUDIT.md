# Board requirements audit

Source: supplied `4YRGR9J9 - zawar.json`, project cards for “plant care schedulling system”. Generic Trello onboarding cards (Jira, Slack capture, mobile-app tutorial) are not plant-care product requirements. Status below means source implementation, not a claim of production deployment.

| Board area                                                            | Source implementation / evidence                                                              | Status                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Next.js, Tailwind, global layout, navbar/sidebar, responsive UI       | app/layout, globals.css, components/workspace                                                 | Implemented; local browser checks                                           |
| Login/register/forgot/profile, password hashing/auth/protected routes | Supabase Auth actions, recovery pages, server verification and RLS                            | Implemented; live email/Auth pending                                        |
| Dashboard stats/today/upcoming/overdue                                | components/views, date module                                                                 | Implemented                                                                 |
| Plant CRUD/details/cards/upload/validation                            | Server Actions + Prisma, plant form, stable image API; delete is approved archive             | Implemented; live Storage pending                                           |
| Task CRUD/details/status/recurring/generation                         | Every N days schedule form; plant routine details; atomic complete/skip; calendar projections | Implemented; future dates intentionally estimates                           |
| Calendar month/week/filter/date/upcoming/completed/overdue            | calendar component, shared data/delta API and derived selectors                               | Implemented; not separate duplicate REST endpoints                          |
| Notification UI/reminder logic/API/upcoming/overdue detection         | inbox, open-tab Browser Notifications, authenticated shared sync API                          | Implemented; no background push/cron/email                                  |
| Growth record CRUD/history/statistics/chart                           | GrowthRecord Prisma/SQL, growth journal, accessible actual-date height chart + exact table    | Implemented                                                                 |
| Photo model/timeline/gallery/upload/delete                            | PlantPhoto Prisma/SQL, dated gallery, upload action, delete and best-effort cleanup           | Implemented; live uploads pending                                           |
| Weather temperature/humidity/rain/recommendation                      | /api/weather Open-Meteo proxy, permission/manual location, confirmed outdoor rain skip        | Implemented; provider smoke check passed, deployed-site check pending       |
| Input/error/loading/empty/authz/security tests                        | Zod, SQL RLS, native dialog flows, tests/ and browser results                                 | Local evidence; not security certification                                  |
| PostgreSQL/Prisma/env/schema                                          | migrations 001+002, prisma/schema, withUser boundary, .env.example                            | Implemented; production DB configuration pending                            |
| GitHub/README/requirements/architecture/ER/use-case                   | README, this audit, architecture and diagram sources/images                                   | Docs provided; repository creation pending access                           |
| Frontend-backend integrations                                         | Server Actions, Prisma data sync, Supabase adapters                                           | Locally tested demo + SQL; live Auth/Storage/Prisma integration pending     |
| Final tests/security/mobile/polish                                    | TEST-REPORT + screenshots + executable tests                                                  | Local checks only                                                           |
| Vercel/production env/database/deploy/website fixes                   | deployment runbook and generated Prisma build hook                                            | Pending account access and live acceptance                                  |
| Documentation/report/screenshots/slides                               | docs/, screenshots/, presentation source/output                                               | Prepared locally                                                            |
| Live demo/local backup/practice/final review                          | runbook; /demo routes; project review checklist                                               | Local backup ready; actual live demo/practice and production review pending |

## Approved changes beyond board

Sproutly branding; light-only lime/forest design inspired by sweet-tape.com; no breadcrumbs; emoji activities/categories; informative cards; password eyes; inbox; change-only sync; public asset caching and offline fallback; weather/location; rain skip confirmation; selective unarchive; every-N-days intervals.

## Not honestly “all done” yet

Creating/pushing the repository, Vercel deployment, applying migrations/configuring production credentials, verifying real email confirmation/recovery, private Storage, Prisma connectivity, live geolocation/notification behavior on target devices and production acceptance. User account/project access is required. Formal presentation practice is a human activity, not something the source can certify.
