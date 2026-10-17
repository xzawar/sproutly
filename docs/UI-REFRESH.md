# Approved UI refresh

Base: xzawar/sproutly commit `4df7e37`.

## Included

- Natural-colour dashboard and authentication photos with lime behind them.
- Tilted white leaf-logo tiles on login, register and password recovery; matching SVG favicon.
- Rounded calendar day cards based on the supplied HTML, status-coloured chips, lime today and clearer day dialogs. Real data, filters, month/week navigation and mobile layouts are retained.
- Optional watering and fertilizing routines in Add plant → Care & character. Each has an N-day interval and first due date. Notes remain separate.
- One authenticated transaction saves the plant and all selected routines. A failed routine insert rolls back the plant too. Editing a plant does not duplicate routines.
- Shorter page copy and reduced-motion-aware transitions.
- Six-character password validation is retained. No database migration or new dependency is required.

## Verification

- ESLint and strict TypeScript checks passed.
- Production build passed.
- 52 automated tests passed, including actual SQL constraint-failure rollback with PGlite and owner isolation.
- 55 existing desktop/mobile browser checks passed.
- Additional desktop/mobile flows passed: create both routines, reload persistence, edit without duplication, white logo tiles, natural photos, calendar layout and reduced motion.
- Updated pages were visually reviewed at desktop and mobile widths.

These are local checks. Live Supabase Auth/email, hosted Prisma connectivity and the Vercel deployment have not been verified or modified.

## Apply the patch

From a clean checkout of the base repository, run:

```sh
git switch -c feat/ui-routines-refresh
git apply --check /path/to/Sproutly-ui-refresh.patch
git apply /path/to/Sproutly-ui-refresh.patch
npm ci
npm run build
npm test
npm run lint
```

Keep existing `.env` files and Vercel environment settings. The source ZIP is an alternative to applying the patch, not an additional step. Review and commit the result, then push your branch to trigger the normal Vercel workflow.

For browser checks, start the production build with `npm start`, then run:

```sh
npm run test:browser
TEST_BASE_URL=http://localhost:3000 node tests/refresh-browser.mjs
```
