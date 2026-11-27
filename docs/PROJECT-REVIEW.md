# Sproutly project review

The public checkout reviewed for this upgrade was `xzawar/sproutly` at `7812700`. Its README, architecture, requirements, board audit, test report, presentation and runbook describe several stages of the project. The source already implements plant profiles, photos, recurring care, calendar, history, growth, weather-assisted rain skips, user preferences and notifications. The working browser demo and the signed-in Supabase workspace use the same features with different persistence.

The Home upgrade builds on that application. Its model registry, garden and house, animated visits, release evidence and installation instructions are in [Living Home](LIVING-HOME.md).

## What remains before live release

| Work                                                           | What to check                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publish the reviewed branch and configure the real environment | Apply pending SQL migrations through 005 to the target Supabase database, configure the documented Auth and Prisma settings and deploy the production build.                                                                                                            |
| Verify account flows and privacy on the hosted app             | Use separate accounts to check signup email, recovery, session refresh, private photo upload and deletion, disabled-account access, and owner-only data. Open Home on two devices and move or water a plant on one. Confirm that the other receives the change.         |
| Reconcile the password policy                                  | The signup and recovery interfaces accept six characters. Confirm the intended Supabase policy and align both forms and their instructions before launch.                                                                                                               |
| Benchmark physical devices                                     | Test orbiting the exterior, the stairs, fullscreen rotation and back-to-back visits on a phone and an integrated-GPU laptop. Record active FPS, frame-time lows, battery load and behaviour after backgrounding. The current performance figures are in the Home guide. |
| Exercise device integrations and operations                    | Verify location permission, notifications, offline fallback and reconnect on the real site. Confirm SMTP, rate limits, backups and restore, monitoring, dependency checks and repeatable CI.                                                                            |
| Establish household capacity in practice                       | Each room and bed has finite usable surface area. Measure collection sizes, initial workspace loads, revision-log growth and photo cleanup. A heavily occupied space can require rearranging pots.                                                                      |

The existing notifications require an open tab. Email or push delivery with the app closed and offline editing would be separate product features.

## Recommended AI automation

**Daily care round.** At the first visit of the gardener’s local day, group the existing due tasks by saved room. Offer one short, optional brief with a direct link from each item to the plant’s actual location. For example, “Check the kitchen Aloe first. Its watering was due yesterday. The patio Rose is also due, and rain is forecast.” Only include the weather sentence when that specific plant meets Sproutly’s existing exposure and forecast criteria.

Calculate the tasks, order, IDs, due dates and weather eligibility in application code. Ask the model only for wording. Validate the returned IDs and retain the grouped list when the model is unavailable. Cache by user, local date and input revision. The user starts each care visit or confirms a skip. This is a proposed feature and requires no AI account or API key to run the current app.

## Next UX improvement

Add a **Next plant in this room** control after a successful care visit when another plant nearby has a due task. It would let someone finish the kitchen in one round while keeping every watering visible and individually confirmed. If users want to match their own apartment more closely, room renaming can preserve the stable location IDs already stored on plants.
