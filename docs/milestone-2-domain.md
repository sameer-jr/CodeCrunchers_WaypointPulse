# MILESTONE 2 — DOMAIN

**Historical milestone record.** Test counts, private local imports, fixture restrictions, limitations and next-milestone statements below describe the dated domain snapshot. The later explicit safe-starter production mode is documented in [production starter readiness](production-starter-readiness.md); it does not publish or relabel the private OFFICIAL imports described here.

Result: **PASS** for the authorized domain milestone, verified locally on 2026-10-02. Milestone 3 has not started. Operational UI/workflows, allocation, PWA/offline and Datathon ML are not implemented.

## COMPLETED

- Preserved Milestone 1 authentication, sessions, role menus and responsive design. All 16 existing automated tests still pass; web/shared source and frontend build asset names remain unchanged.
- Added 23 normalized domain/support models, centralized lifecycle with all 17 order states, transactional audit/history, optimistic concurrency and related-record guards.
- Kept ORDERED/LOADED/DELIVERED/RECEIVED as separate facts. Loading shortfalls hold departure until review; receipt discrepancies remain actionable.
- Added object scope, private atomic CSV import/provenance, retained deferrals and weekly fuel consumption/reservations with unknown opening history.
- Added independently authored synthetic fixtures and 30 domain tests using actual PostgreSQL. Fixtures prepare records for lifecycle tests; they are not operational workflows or generated plans.
- Updated architecture, real operational ER diagram, implementation status, README and AI disclosure.

## FILES CHANGED

| Area | Files |
| --- | --- |
| Schema | `prisma/schema.prisma` |
| Migrations | `prisma/migrations/20261002000200_domain/migration.sql`, `prisma/migrations/20261002000201_domain_constraints/migration.sql` |
| Domain services | `apps/api/src/domain/{audit,dates,errors,fuel,lifecycle,reads,reference-data,routes,scope}.ts` |
| Domain tests | `apps/api/src/domain/domain.test.ts`, `apps/api/src/domain/testing/synthetic.ts` |
| Transport | `apps/api/src/app.ts`, `apps/api/src/http.ts` |
| Import/upgrade/test/safety | `scripts/import-reference-data.ts`, `scripts/migration-regression.mjs`, `scripts/test.mjs`, `scripts/check-safety.mjs` |
| Dependencies/configuration | Root/API `package.json`, `package-lock.json`, `tsconfig.scripts.json`, `eslint.config.js`, `.gitignore`, `.dockerignore`, `apps/api/Dockerfile` |
| Documentation | `README.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/AI_DISCLOSURE.md`, `docs/design-and-implementation-plan.md`, this report |

Private CSV extraction and local verification helpers/results are under ignored `private-data/` and `.local/`. No reference CSV/prototype records were added to frontend/shared/auth seed. No Git repository was initialized or public data staged.

## SCHEMA / MIGRATION

- 25 total models; User and Session scalar fields remain unchanged. Supporting models normalize depots, planning runs, provenance, scope mappings and fuel.
- The two additive domain migrations use transaction boundaries and retain the original auth migration. SQL checks/triggers cover positive capacities/quantities, date/window consistency, trip numbers 1–2, stop sequences, one active order assignment, matching compound relationships, recorder/reviewer roles and historical integrity.
- Fresh migration and repeated deploy/seed passed against isolated PostgreSQL. An additional database first applied the original Milestone 1 SQL only, seeded four users and inserted a session; two upgrade/seed runs preserved full user/password/session fingerprints.
- Existing development database also upgraded successfully: **4 users and 1 existing session preserved exactly**, checked using hashes without exposing credentials. Reference imports preserved those fingerprints too. Counts for Order/Trip/Allocation, scope mappings and fuel ledgers/usage were zero after import.
- Use committed migrations. Prisma schema push alone omits required SQL checks/partial indexes/triggers. The lifecycle transaction flag is an accidental-write guard, not protection against a privileged database operator.

## TESTS RUN

| Command/check | Result |
| --- | --- |
| `npm run test` before major changes | PASS — 16 existing tests |
| Prisma schema format/generate and `npm install` | PASS — generated client; dependency audit reported zero vulnerabilities |
| `npm run typecheck` | PASS — shared, API, web, tests and scripts |
| `npm run lint` | PASS |
| `npm run test` after final domain changes | PASS — 46 tests across 3 files, actual PostgreSQL/Prisma; fresh/repeated migration and separate M1 upgrade preservation |
| `npm run build` | PASS — shared/API/web production build |
| `npm run check:safety` | PASS — private Git/Docker exclusions, embedded dataset markers, 180 actual official identifiers checked against frontend/shared/auth seed/public bundle |
| `npm run import:reference -- --source official --dry-run` | PASS — all five files validated; no writes |
| `node .local/upgrade-development.mjs` | PASS — existing development migration/fingerprints and official import twice; second import repeated=true |
| `node .local/domain-running-smoke.mjs` | PASS — web/database readiness; all four logins, session restoration, assigned workspace, cross-role rejection, unassigned object denial, logout/replay through Vite proxy |
| Prototype SHA256 baseline comparison | PASS — all 13 original files unchanged |

The 30 domain tests cover malformed/duplicate/invalid imports and mid-transaction rollback, idempotent provenance, legal/illegal/unauthorized transitions, concurrency, failed-audit rollback, separate quantity facts, retained discrepancy snapshots, trip/stop/depot integrity, scope boundaries, repeated deferrals, proof keys and Colombo fuel weeks/unknown opening history. No database tests are skipped. M2 running checks are HTTP integration checks, not a new browser workflow acceptance claim. M1 browser/responsive evidence remains in the foundation report; M2 did not change its frontend.

## DATA IMPORT STATUS

All five expected official CSVs were found in the supplied private ZIP, extracted into ignored `private-data/reference/`, validated and imported locally with OFFICIAL provenance:

| Source | Imported rows |
| --- | ---: |
| `outlets.csv` | 120 |
| `vehicles.csv` | 60 |
| `calendar.csv` | 910 |
| `district_travel.csv` | 12 |
| `service_allowance.csv` | 9 |

Missing expected CSVs: **none**. No GPS/address fields or verified opening fuel history were supplied; none were fabricated. Calendar fractional ramp and its source weekend convention are preserved. Travel keys retain both depot and district. One digest/provenance batch was created; repeating the identical import created no additional rows. Changed conflicting inputs fail atomically and require future explicit reconciliation.

Synthetic fixtures: independently authored, labelled SYNTHETIC, isolated automated test data only. They cover both depots, all brands/temperature requirements, van-only/mall access, reefer/ambient truck/van, capacity differences and operating/non-operating dates. They are not seeded into the development database. Synthetic eligibility needs explicit test/development opt-in and is forbidden in production. Precomputed allocation and Datathon files were not imported/executed or treated as generated output.

## AUTHORIZATION STATUS

- Identity/role comes from the active current server-side user; role injection remains rejected.
- Store Manager uses assigned UserOutlet records. Dispatcher/Loader use UserDepot; Loader loading mutation scope requires released trips before departure. Driver requires its assigned released trip.
- Scoped outlet/order/trip GET endpoints return safe DTOs with no-store. No operational POST endpoints were introduced.
- Foundation demo users remain unassigned after official import; object access defaults to denial. Tests exercise allowed synthetic assignments and cross-object denial on reads and centralized transitions.

## ACCEPTANCE

- [x] Normalized schema and fresh/existing migrations
- [x] Independent safe fixtures and private validated import
- [x] Central lifecycle, invalid transition rejection and atomic audit
- [x] Four quantities retained separately
- [x] Deferral history, object scope and fuel ledger foundations
- [x] Existing authentication/session/role design retained
- [x] Typecheck, lint, 46 tests, production build and safety checks pass
- [x] Private sources excluded from public frontend/build and installation seed

## REMAINING RISKS

- Docker is unavailable; container build/startup and deployed acceptance remain unverified. Private reference files are excluded from image builds and require a separate private import procedure in a deployment.
- Historical fuel opening balances are unknown; remaining fuel is null until a verified opening balance is supplied.
- Proof binary storage/access and operational services/UI are deferred. Planning validation/release fields and lifecycle prerequisites do not implement an allocation/validation algorithm.
- Real outlet/depot/driver assignments require explicit later administration; demo users are intentionally unassigned.
- The importer is insert-only with digest-based repeat handling. Dataset corrections/reconciliation need a reviewed later operation.

## NEXT MILESTONE

Milestone 3 — Store. **Not started.**
