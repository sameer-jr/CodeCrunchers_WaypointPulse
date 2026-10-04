# MILESTONE 3 — STORE

Verification date: **2026-10-03**, Asia/Colombo. Scope is Store Manager only. Milestone 4 has not started.

Local Store acceptance is recorded below. Docker runtime, current official-calendar eligibility and physical mobile keyboard verification remain separate limitations.

## COMPLETED

- Implemented persisted Store Home → Place Order → Order Tracking → Confirm Receipt / Report Issue using the existing PostgreSQL/domain architecture.
- Preserved server sessions, active-user and role authorization, object scope, central lifecycle, transactional audit, private reference protections and the existing role shell.
- Added single-outlet server resolution, scoped queries, brand-aware order validation, Asia/Colombo cutoff decisions and calendar-based eligibility.
- Added transactional receipts, separate ordered/loaded/delivered/received facts, actionable quantity/damage/other issues and durable proof metadata display.
- Added independently authored synthetic test/judge scenarios and 56 Store tests. The complete automated suite has 102 real PostgreSQL tests, including all 46 previous tests.
- Added controlled local assignment and explicit synthetic demonstration commands. No Dispatcher workflow, allocator, PWA/offline synchronization or ML implementation was added.

## FILES CHANGED

| Area | Files |
| --- | --- |
| Shared request schemas and safe DTOs | `packages/shared/src/store.ts`, `packages/shared/src/index.ts` |
| Store services and transport | `apps/api/src/store/{cutoff,scope,services,routes}.ts`, `apps/api/src/app.ts`, `apps/api/src/config.ts` |
| Central lifecycle integration | `apps/api/src/domain/lifecycle.ts` |
| Schema and additive migration | `prisma/schema.prisma`, `prisma/migrations/20261003000300_store/migration.sql` |
| Store interface | `apps/web/src/store/{Home,PlaceOrder,Tracking,Receipt,OrderSelection,StoreWorkspace,components}.tsx`, `apps/web/src/store/api.ts`, `apps/web/src/store/store.css` |
| Store shell integration | `apps/web/src/Shell.tsx` |
| Tests and reusable safe scenarios | `apps/api/src/store/store.test.ts`, `apps/api/src/store/testing/synthetic.ts`, `scripts/test.mjs`, `scripts/migration-regression.mjs` |
| Controlled local demonstration | `scripts/assign-store.ts`, `scripts/setup-store-synthetic.ts`, `scripts/setup-store-judge.mjs`, `scripts/store-judge-fixtures.ts`, root `package.json`, `.env.example` |
| Documentation | `README.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/AI_DISCLOSURE.md`, `docs/design-and-implementation-plan.md`, this report |

The schema retains 25 models. The migration adds nullable `Order.eligibleDeliveryDate` and `Receipt.issueType`, backfills existing eligible dates from the original request, preserves original quantity facts, and strengthens eligible-date immutability/trip-stop timing guards. Existing authentication tables and migrations remain intact. Use committed migrations; schema push omits SQL integrity guards.

## STORE ASSIGNMENT

- The server resolves exactly one `UserOutlet` assignment from the authenticated active Store Manager. No assignment or multiple assignments is denied. Frontend input cannot select ownership, creator, brand, depot or role.
- `npm run demo:assign-store -- --outlet-id <UUID>` or `--outlet-ref <private-reference>` assigns the local account. Existing scope changes require explicit `--replace`. The command is restricted to a loopback development database and forbidden in production. Private official identifiers need not appear in source code.
- `npm run demo:store-synthetic` creates independently authored `SYN-DEMO-FRESH` and up to 60 explicit synthetic calendar dates in the normal local `/waypoint` database, then assigns the Store demo account. It creates no orders or plans and never overwrites imported calendar rows. The current mapping is exactly one `UserOutlet` to this synthetic outlet. Its Monday–Saturday pattern is an independently authored fixture, never an inference about the official calendar.
- `npm run demo:store-judge` prepares a separate `/waypoint_store_judge` database with synthetic clean-receipt, partial-quantity, damage, deferred and planned scenarios. The normal `/waypoint` database and its assignments are unaffected by this command. Prepared plan/trip/load/delivery records are labelled fixture data and are not allocator output.
- Synthetic order eligibility requires explicit `STORE_ALLOW_SYNTHETIC=true`. The default is false; production rejects the option. Auth seed remains auth-only and does not install operational fixtures.
- All five official CSVs remain available privately. Their calendar ends **2026-06-28**, before the verification date **2026-10-03**. Official current/future order eligibility is therefore unavailable until a verified updated calendar is supplied. The application does not relabel synthetic dates as official or invent official operating days.

## ORDER / CUTOFF BEHAVIOR

| Endpoint | Behavior |
| --- | --- |
| `GET /api/store/context` | Assigned outlet, brand context, server clock, cutoff, allowed temperatures and persisted operating dates |
| `GET /api/store/home` | Persisted counts, recent orders and attention items within the single assigned outlet |
| `GET /api/store/orders?status=&date=` | Scoped status/requested-date filtering, safe summaries and total |
| `GET /api/store/orders/:id` | Scoped detail, audit timeline, deferral history, trip/arrival data, quantities, receipt and issues |
| `POST /api/store/orders` | Validated transactional creation and central confirmation; returns 201 |
| `POST /api/store/orders/:id/receipt` | Validated transactional receipt and central state changes; returns 201 |

- Requested fields are `requestedDeliveryDate`, `temperatureRequirement`, `orderedUnits`, `orderedWeightKg`, and `orderedVolumeM3`. Both frontend and backend use shared strict validation; real dates and operating eligibility are checked again on the server. Quantities must be positive, units whole, and weight/volume use at most three decimal places.
- Fresh supports ambient, chilled and frozen order requirements with daily operational context. Style and Tech are ambient only, with weekly and as-needed context respectively. No product catalog is introduced.
- The server closes tomorrow's run at **16:00 inclusive in Asia/Colombo**. Before cutoff, a valid next-day request remains eligible for that date. At/after cutoff, the original requested date is retained and `eligibleDeliveryDate` moves to the first permitted persisted operating date strictly after tomorrow. The response explains both dates.
- Today/past, missing-calendar and non-operating requested dates are rejected. A later operating requested date remains unchanged after cutoff. No later operating date after a missed cutoff produces a clear conflict rather than an invented date. Operating flags come from `CalendarDay`, not a frontend weekday assumption.
- Database creation time remains the original creation timestamp. References use `WP-YYYYMMDD-<random UUID hex>`, independent of row counts and competition order references.
- Creation writes `ORDER_CREATED` and invokes central `ORDER_CONFIRMED` once in the same transaction. Optimistic versions and serializable transactions remain authoritative. Bounded retry is limited to creation serialization conflicts; receipt conflicts are returned for reload/review.

## TRACKING

- Timeline stages come from persisted audit events and current lifecycle state. Same-transaction event ties use persisted lifecycle versions, so creation precedes confirmation.
- An unplanned confirmed order shows awaiting planning, with no fabricated trip, vehicle or ETA. Planned arrival comes from `TripStop.plannedArrival`; actual arrival/departure/delivery completion are displayed separately from recorded operational timestamps.
- Deferral details, reasons, timestamps and next eligible dates come from `DeferralRecord`; the interface retains history.
- Loading, in-transit, delivered, receipt-confirmed and receipt-issue states render only when the backend returns those states. Driver/Loader/Dispatcher UI workflows are outside this milestone.
- Evidence shows persisted recipient/role metadata and presence flags. Binary content remains explicitly unavailable; no prototype image is presented as real delivery proof and private storage keys are not exposed.
- TanStack Query supplies Store data. Order creation and receipt completion refresh home/orders/detail queries; PostgreSQL remains the source of truth after reload.

## RECEIPT / ISSUES

- Only already delivered/partially delivered records with an active successful delivery and no existing receipt can be received. The submitted version must match. Direct delivery-to-receipt handling uses the central intermediate awaiting-receipt transition transactionally.
- Matching actual received units with no issue creates `Receipt.CONFIRMED` and moves the order to `RECEIPT_CONFIRMED`. An optional clean receiving note is retained without creating an exception.
- Any received/delivered mismatch, reported damage or other receipt issue creates `Receipt.ISSUE_REPORTED`, a receipt-linked open Exception, and `RECEIPT_ISSUE`. Quantity/other issues use `RECEIPT_DISCREPANCY`; damage uses `DAMAGED_GOODS`. Useful notes of at least five characters are required.
- A quantity mismatch is still treated as an issue when the client selects no issue. Delivered quantity is never replaced by received quantity. The central lifecycle prevents clean confirmation while any receipt issue remains unresolved.
- Duplicate/stale/concurrent receipt submissions cannot create a second receipt. Failed audit insertion rolls back receipt, exception and order changes together. Later Dispatcher review/resolution remains outside Milestone 3.
- Every Store endpoint rechecks server identity/scope. Another outlet's order ID returns the same not-found response as an absent order. Read and mutation role/ownership injection is rejected, and responses omit credentials/raw evidence keys with `Cache-Control: no-store`.

## TESTS RUN

| Command/check | Result |
| --- | --- |
| `npm run test` before major changes | PASS — all 46 existing tests |
| `npm run test` complete Store suite | PASS — 102 tests: 16 authentication/shared, 30 domain and 56 Store; actual Prisma/PostgreSQL, no skipped database tests |
| Isolated original M1 → current migration, repeated seed/deploy | PASS — user/password/session fingerprints preserved |
| Isolated original M2 → current migration, repeated seed/deploy | PASS — original operational facts and 73 ordered / 69 loaded / 66 delivered / 65 received retained; eligible-date backfill verified |
| Owned Store test/fixture/harness ESLint and API TypeScript | PASS |
| `npm run typecheck` | PASS — shared, API, web, test and script TypeScript |
| `npm run lint` | PASS — apps, packages, Prisma and scripts |
| Final `npm run test` after receiving-note assertion, demo/test isolation correction and field-message refinement | PASS — 102/102 across four files, exit 0; no skipped tests |
| `npm run build` | PASS — shared/API compilation and production web bundle |
| `npm run check:safety` | PASS — 180 official identifiers absent from frontend/shared/auth seed/public build; private exclusions and dataset-marker checks pass |
| Prototype SHA256 baseline comparison | PASS — all 13 original file hashes unchanged |

Store tests run in their own isolated database, preserving the previous auth/domain fixture assumptions. Coverage includes empty persisted home; assignment/ownership; all Fresh temperatures and ambient-only brands; date/cutoff boundary and UTC/Colombo differences; an explicitly non-operating weekday and operating Sunday; missing later calendar; unique concurrent order creation; failed-audit rollback; eligible-date/trip timing SQL guards; direct ID and role denial; no fabricated ETA; real planning/deferral/proof metadata; all four quantities; normal/partial/damage/other receipts; missing notes; version/duplicate/concurrent protection; optional clean note; and transactional issue rollback.

## MANUAL VERIFICATION

Browser verification used the normal loopback development database for creation and the separate synthetic judge database for prepared receipt/deferral/arrival scenarios. Screenshots contain independent synthetic references only. The private official calendar was checked first; the UI correctly blocked creation when no future official operating dates existed.

| Browser scenario | Result/evidence |
| --- | --- |
| Store login, assigned Home and navigation | PASS — real credential login resolves the server-assigned outlet; all four Store views accessible |
| Empty/loading/error states and live persisted counts | PASS — initial zero-order Home; loading states observed during queries; foreign detail shows retryable error. Judge Home changed from 3 awaiting receipts/0 attention to 0 awaiting/2 attention/1 completed after receipts |
| Place Order validation, creation and reload persistence | PASS — empty quantities reject with field guidance; created Chilled order for 73 units, 41.250 kg, 0.750 m³ and 2026-10-05. Normal order `WP-20261003-DEDFBC172B584701ADB5A6B57AB61377` remains confirmed after tracking reload and re-login; DB has exactly two creation/confirmation audit events |
| Confirmed awaiting-planning tracking without ETA | PASS — recorded creation/confirmation and honest awaiting-planning state; no vehicle, planned arrival or fake proof. [390px tracking](screenshots/store-tracking-390.png) |
| Real planned arrival and persisted deferral history | PASS — `SYN-JUDGE-PLANNED` renders stored 06:30 Colombo arrival, unknown actual times; `SYN-JUDGE-DEFERRED` renders persisted capacity reason/timestamp and 2026-10-05 next date. [768px deferral](screenshots/store-deferred-768.png) |
| Correct delivered receipt | PASS — `SYN-JUDGE-CLEAN` saves 73 received, `CONFIRMED`, clean note, no exception; form replaced by saved receipt. Direct DB verification confirms persisted data. [Desktop receipt](screenshots/store-receipt-clean-1440.png) |
| Quantity discrepancy and damage remain actionable | PASS — discrepancy keeps 73 ordered/69 loaded/66 delivered/65 received, requires note, survives reload, `ISSUE_REPORTED` with OPEN `RECEIPT_DISCREPANCY`. Matching-quantity damage saves 73 received with OPEN `DAMAGED_GOODS`. [Phone receipt issue](screenshots/store-receipt-issue-phone.png), [768px damage](screenshots/store-receipt-damage-768.png) |
| Unauthorized outlet/order access | PASS — direct browser URL to an existing auxiliary synthetic foreign order displays only `Order not found`; own selector remains scoped. Live API foreign outlet GET 403, Store order GET/receipt POST 404, no foreign record contents. [Denied detail](screenshots/store-foreign-denied-768.png) |
| Store at 390px | PASS — DOM scroll/client width 375/375 with native vertical scrollbar; stacked form/receipt/quantities/timeline, accessible bottom navigation, focused input visible with 16px text; form controls/buttons 48–50px high. [Place Order](screenshots/store-place-order-390.png) |
| Store at 768px | PASS — DOM scroll/client width 753/753 with native vertical scrollbar; stacked panels, accessible drawer navigation, no horizontal overflow. [Place Order](screenshots/store-place-order-768.png) |
| Desktop and original rendered Store prototype comparison | PASS — rendered original Home/Place Order compared with implementation; light canvas, charcoal sidebar, lime accent, rounded cards, summary/timeline and quantity/evidence treatment retained. [1440px Home](screenshots/store-home-1440.png) |

Normal development data still has all 120 official outlets and 910 official calendar days, with **zero trips and zero allocations** after Store creation. Receipt/planned/deferral preparation exists only in the isolated judge database; an auxiliary foreign draft there was created solely for direct scope verification. Temporary judge/prototype web servers were stopped; the normal localhost app and PostgreSQL remain running with data preserved. The browser viewport override was reset.

Final localhost web and `/api/health` both returned HTTP 200; the health endpoint reported the database connected. Commands above were invoked as `npm.cmd` on Windows because PowerShell's npm script entry point was blocked. All required command checks passed after final source changes. [Current local review screenshot](screenshots/store-home-review.png).

Mobile verification uses browser viewport, focus, scroll, typography and touch-target checks. A physical device's onscreen keyboard was not exercised.

## DOCKER VERIFICATION

Docker is unavailable on this machine (`Get-Command docker` returns no executable). Container build/startup was not run. PostgreSQL integration tests and local browser acceptance do not establish Docker acceptance.

## RESULT

**PASS — local Milestone 3 Store acceptance.** Docker runtime and current official-calendar operation are not claimed. Milestone 4 is not started.

## REMAINING RISKS

- Official current/future operating calendar coverage is missing. Synthetic local/judge scenarios are explicit development data, not authority for real competition eligibility.
- Proof binary upload/storage/access remains unavailable; only metadata is implemented.
- Dispatcher exception resolution, vehicle allocation/planning generation and other operational roles remain deferred. Store orders correctly stop at confirmed/awaiting planning until later milestones act.
- Docker runtime/deployment remain unverified. Historical opening fuel balances remain unknown from Milestone 2.
- Order lists return at most 100 scoped records and dashboard previews are bounded; cursor/page navigation for larger histories is a later extension.
- Physical mobile keyboard behavior remains unverified. Browser widths/focus/scroll and input typography passed.
- Judge receipts are one-time persisted facts. Re-running fixture setup preserves existing receipts; fresh isolated test runs provide repeatable clean scenarios. Separate previews on one hostname share cookies across ports, so keep one active browser preview or use distinct hosts with correctly configured origins.

## NEXT MILESTONE

Milestone 4 — Dispatcher. **Not started.**
