# MILESTONE 1 — FOUNDATION

Verified locally on 2026-10-02, Windows, Node.js 24.20.0 and npm 11.19.0.

## COMPLETED

- npm workspaces at the existing root: React/TypeScript/Vite web, Express/TypeScript API and shared authentication package.
- React Router, TanStack Query, Zod, React Hook Form and Tailwind CSS configured.
- Real credential authentication, salted scrypt password hashes, revocable PostgreSQL-backed HTTP-only sessions, server-owned roles, origin validation and centralized guards/errors.
- PostgreSQL/Prisma User and Session entities only, versioned migration, and four idempotently seeded demo accounts. Default local demo password: `WaypointDemo!2026`; configurable before initialization through `SEED_DEMO_PASSWORD`.
- Health/login/logout/me endpoints and four role-restricted workspace endpoints.
- All 17 requested navigation screens, honest foundation states and responsive shells retaining the original logo, light canvas, charcoal navigation, lime accents, rounded cards and mobile navigation.
- Visible focus, skip links, semantic navigation, form labels, keyboard menu focus handling and usable touch targets.
- Root development/check scripts, environment template, private-file exclusions, Dockerfiles and Compose health/migration/seed initialization configuration.
- Original prototype preserved; SHA256 comparison confirms all 13 reference files unchanged. Only the two brand PNGs were copied into public assets. No dataset ZIP was opened/imported, no confidential source data was seeded/bundled, and no files were staged.

## FILES CHANGED

- Root: `package.json`, `package-lock.json`, `tsconfig.base.json`, `tsconfig.scripts.json`, `eslint.config.js`, `vitest.config.ts`, `.env.example`, `.gitignore`, `.dockerignore`, `docker-compose.yml`, `README.md`.
- Web: workspace package/config, HTML entry, `src/main.tsx`, `Login.tsx`, `Shell.tsx`, `auth.tsx`, `api.ts`, `navigation.ts`, `styles.css`, two public brand PNGs, Dockerfile and Nginx configuration.
- API: workspace package/config, `src/server.ts`, `app.ts`, `auth.ts`, `password.ts`, `config.ts`, `http.ts`, `auth.test.ts`, Dockerfile.
- Shared: workspace package/config, `src/index.ts`, `src/auth.test.ts`.
- Prisma: `schema.prisma`, `seed.ts`, migration lock and `20261002000100_auth_foundation/migration.sql`.
- Scripts: `setup-local.mjs`, `dev-db.mjs`, `local-postgres.mjs`, `process.mjs`, `test.mjs`, `check-safety.mjs`.
- Docs: this report, `architecture.md`, `data-model.md`, `AI_DISCLOSURE.md`, implementation-plan completion status and three browser screenshots.
- Ignored local runtime artifacts: generated `.env`, PostgreSQL development/test files, dependencies and compiled outputs. No nested Git repository was created.

## TESTS RUN

- `npm install` → PASS; Prisma client/shared package generated; audit reported zero vulnerabilities.
- `npm run typecheck` → PASS, including shared/API tests and Prisma seed.
- `npm run lint` → PASS.
- `npm run test` → PASS; 16 tests in two files using a fresh isolated PostgreSQL 18.4 database. The runner exited with code 0 and removed its temporary cluster. Migration/seed were applied twice to check safe repeat initialization.
- `npm run build` → PASS; shared and API compiled and production web bundle generated.
- `npm run check:safety` → PASS; ignored private resources and Docker exclusions checked; application/seed/public build contained no tested competition dataset markers.
- SHA256 prototype comparison → PASS, all 13 files unchanged.
- Compose YAML structural parse → PASS; PostgreSQL/API/Web services and health dependencies present. This is not container runtime verification.

Authentication integration checks cover all seeded logins and safe identity fields, incorrect/unknown credentials, unauthenticated requests, Driver/Store versus Dispatcher denial, the full four-role access matrix, client role injection, malformed JSON, foreign origins, logout replay, expired/forged sessions, deactivated accounts, hash storage and database health.

Two Windows issues encountered during verification were resolved: Prisma generation while the running API held its native DLL, and embedded PostgreSQL shutdown leaving worker handles open. Installation was rerun successfully with the API stopped; the local database runner now uses PostgreSQL's `pg_ctl` for start/stop. The final test run completed cleanly.

## MANUAL VERIFICATION

- Login rendered at desktop and phone sizes; incorrect credentials showed a useful error.
- Each of the four seeded accounts authenticated, redirected to its assigned workspace and signed out successfully.
- All 17 requested screen links rendered the matching title and honest foundation content.
- Dispatcher/Driver/Store cross-role URLs were denied; anonymous protected navigation returned to login. API integration tests checked every role/resource pairing.
- Protected-page reload restored the Driver session; a database restart retained seeded credentials and the Dispatcher login still succeeded.
- Open/close menu, Escape, Tab wrapping, return focus and inert hidden navigation were checked on mobile.
- Document width was checked against viewport width for every screen at the required role sizes:

| Role | Widths | Screens verified | Horizontal overflow |
| --- | --- | --- | --- |
| Dispatcher | 1440px | 6 | None |
| Loader | 390px, 768px | 3 at each width | None |
| Driver | 360px, 390px | 4 at each width | None |
| Store Manager | 390px, 768px | 4 at each width | None |

Browser evidence: `screenshots/foundation-login-1440.jpg`, `screenshots/foundation-dispatcher-1440.jpg`, `screenshots/foundation-driver-390.jpg`.

## DOCKER VERIFICATION

- NOT TESTED. Docker is not installed/available on PATH. Dockerfiles and Compose configuration were reviewed and YAML parsed, but images were not built and containers were not started. Automatic migration/seed and container health ordering need fresh runtime verification on a Docker-capable machine.

## RESULT

- PASS — local Milestone 1 foundation acceptance. The explicitly permitted Docker runtime limitation is recorded above.

## REMAINING RISKS

- Container build/startup and HTTPS deployment have not been verified.
- Local managed PostgreSQL relies on a beta-tagged binary package; Windows was tested, other host platforms were not.
- Browser acceptance was performed manually through automation controls; it is not yet a committed browser regression suite or a full accessibility audit.
- Use fresh secrets and different credentials for any shared deployment. Existing seeded accounts retain their passwords when seed configuration changes.
- Object-level outlet/depot/driver scopes await their domain entities; current role authorization is enforced.
- Automatic approval review rejected removal of one stopped temporary cluster from an interrupted test run, reporting only `blocked by policy`. That folder remains in ignored `.local`; the final successful test run stopped and removed its own cluster.

## NEXT MILESTONE

- Milestone 2 — Domain. Not started; work stops at the approved foundation boundary.
