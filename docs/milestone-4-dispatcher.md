# MILESTONE 4 — DISPATCHER

Review date: 2026-10-03 · Asia/Colombo. Scope: Dispatcher foundation only. Milestone 5 has not started.

## COMPLETED

Six Dispatcher views use the approved prototype composition: Pulse, Orders, Planning Studio, Routes / Trips, Exception Centre and Future Capacity. PostgreSQL is the source of operational facts. Loader and Driver retain their existing foundation screens; Store and Login presentation are preserved. All 13 original prototype files match their SHA256 baseline.

## FILES CHANGED

| Area | Files |
| --- | --- |
| Shared contract | `packages/shared/src/dispatcher.ts`, `packages/shared/src/index.ts` |
| API integration | `apps/api/src/app.ts`, `apps/api/src/config.ts` |
| Dispatcher reads | `apps/api/src/dispatcher/context.ts`, `dto.ts`, `filters.ts`, `routes.ts`, `scope.ts`, `services.ts` |
| Dispatcher tests/fixtures | `apps/api/src/dispatcher/dispatcher.test.ts`, `testing/synthetic.ts` |
| Web integration | `apps/web/src/Shell.tsx` |
| Dispatcher interface | `apps/web/src/dispatcher/DispatcherWorkspace.tsx`, `Pulse.tsx`, `Orders.tsx`, `Planning.tsx`, `Routes.tsx`, `Exceptions.tsx`, `Future.tsx`, `api.ts`, `components.tsx`, `url.ts`, `dispatcher.css` |
| Database | `prisma/schema.prisma`, `prisma/migrations/20261003000400_dispatcher_indexes/migration.sql` |
| Local review | `scripts/assign-dispatcher.ts`, `setup-dispatcher-judge.mjs`, `dev-dispatcher-judge.mjs`, `dispatcher-judge-fixtures.ts`, `scripts/test.mjs`, `package.json`, `.env.example` |
| Regression | `apps/api/src/store/services.ts` bounds serialization retries with backoff; `store.test.ts` retains its cases, improves concurrent-response diagnostics and expects explicit role denial for the Dispatcher namespace |
| Documentation/evidence | `README.md`, `docs/architecture.md`, `data-model.md`, `AI_DISCLOSURE.md`, `design-and-implementation-plan.md`, this report and `docs/screenshots/dispatcher-*` |

No dependencies, official reference sources or original prototype files were changed. Private runtime configuration and local acceptance helpers remain ignored.

## DISPATCHER ASSIGNMENT / SCOPE

- The active authenticated Dispatcher is resolved on every request. `UserDepot` permits one or several explicitly assigned depots; missing mappings deny access. Lists support narrowing to an assigned depot, and reject an unassigned depot.
- Foreign direct order/trip/exception IDs return the same 404 response as missing records. Every non-null Exception relationship must remain within scope, including order, trip, loading, delivery and receipt links. Malformed mixed-depot trips and their related orders/issues fail closed even though normal database integrity guards already prohibit those writes.
- `npm run demo:assign-dispatcher -- --depot-name "SYNTHETIC Store Demo Depot"` assigned the main local demo account to exactly that existing synthetic depot. Repeat `--depot-name` or `--depot-id` for deliberate multi-depot scope; existing scope changes require `--replace`. Production/non-loopback assignments are rejected.
- The separate judge database assigns only `SYNTHETIC Store Scenario Depot`. It has no imported official dataset. `demo:dispatcher-judge` prepares independently authored fixtures; `dev:dispatcher-judge` previews them on localhost:5175 without editing `.env` or the main database.
- Default date priority is explicit request, optional configured demo day, meaningful scoped persisted demand/trip date, then current Sri Lanka date. The judge default is **2040-02-06**. Dates and namespaced filters/pagination/selection persist in the URL. Selecting a date creates no calendar rows.

## PULSE

Counts aggregate all matching scoped records; bounded preview lists do not determine totals. After the browser handoffs on 2040-02-06: **13 operational orders, 7 awaiting planning, 2 planned, 1 deferred, 3 delivered/receipt-issue orders, 3 open exceptions and 4 active trip records**.

Fleet context shows **7 master vehicles: 6 trucks, 1 van, 2 reefer, 5 ambient; 10,210 kg and 97.5 m³ master capacity**. These are master facts, including an inactive record. Operational availability, workshop/readiness and fuel availability remain unknown. Network/attention links open real trip and exception records; no geographic position or telemetry is invented.

## ORDERS

Date basis, status, brand, assigned depot, district, temperature, recorded deferral history and order/outlet reference search are server-filtered. Page size defaults to 25 and caps at 100; the UI offers 10/25/50. A browser check showed page 2 with **11–13 of 13** records.

The inspector keeps requested, initially eligible and operational dates separate, and shows four independent quantities, weight/volume, receiving windows, dock/access/mall conditions, audit history, deferral records and linked trips/issues. `SYN-DSP-TRIP-LATER` demonstrates a **Feb 6 requested date, Feb 9 eligible date and Feb 10 active trip service date**. Operational filtering uses the active trip day first; requested-date filtering is explicit.

`SYN-DSP-DEFERRED-TWICE` shows exactly two persisted deferrals: CAPACITY and FUEL_UNKNOWN, recorded timestamps and next eligible date Feb 8. It does not claim consecutive days, a fairness score or automatic reallocation. Rapid filter changes merge into the current URL, preserving earlier selections. Contextual links clear incompatible target-view filters; ordinary menu navigation preserves them.

## PLANNING STUDIO

The three areas retain orders, planning/fleet/trips context and Explain My Plan. At narrower widths they stack. Eligible demand requires an actual operating calendar day, confirmed/closed-for-planning status, no active assignment and an initial eligible date at or before the selected date. Deferred backlog is separate review context and is not declared allocatable demand.

The judge day after browser creation shows **7 eligible requests, 268 units, 187 kg and 3.8 m³**, including ambient/chilled/frozen, Fresh/Style/Tech and one van-only request. Totals cover all matching orders. Previews cap eligible/deferred orders at 100 each, master vehicles at 200 and trips at 50; the UI states these limits.

Unknown and non-operating days show an explicit reason and **zero primary quantities, temperature counts and van/mall counts**. Reference travel/service allowances are inspectable, without claiming feasibility checks.

Generate Plan, Validate Plan and Release Plan are disabled. No candidate matching, scoring, route generation, automatic deferral, validation, explanation generation or publication is implemented. Existing synthetic plans/trips were prepared explicitly as fixtures.

## ROUTES / TRIPS

Vehicle/trip groups, persisted status, capacities, shipment totals, driver assignment and planned/actual departure/return facts are read-only. `SYN-DSP-PREPARED-TRIP` shows recorded stop sequence **1 Fresh, 2 Style**, planned arrivals **06:30 / 07:30 Sri Lanka time**, and actual arrivals **not recorded**. A district/stop manifest occupies the map area because verified coordinates and live GPS are unavailable. Prepared delivery-trip states are fixture snapshots; they do not demonstrate an implemented Driver journey.

## EXCEPTIONS

Lists filter operational day, assigned depot, supported issue type/state and note/order/trip search. Details retain the safe note, related order/outlet/trip, timestamps, unresolved state and separate quantity facts. Creator role provenance is explicit: an attributable audit snapshot where available, otherwise the current creator account or unknown. No historical role is guessed.

Receipt discrepancy and damage fixtures remain open. Exception Centre is read-only because resolution business rules are undefined. Proof shows recipient/evidence metadata and availability flags; storage keys and unavailable binary evidence are not exposed.

## CROSS-ROLE VERIFICATION

The following were created through the actual Store browser UI, followed by sign-out and a separate Dispatcher sign-in. No manual judge-database edits occurred between roles.

| Handoff | Persisted evidence |
| --- | --- |
| New order | `WP-20261003-4532860837FA4DAB9EBD2834A64A95F5`, ID `35775683-2174-4669-ba94-4fb59e5e3202`: **91 chilled units, 68.5 kg, 1.25 m³**, Feb 6 requested/eligible, CONFIRMED version 2. Dispatcher searched and inspected the same ID; reload preserved date/search/selection. No duplicate order was created. |
| New receipt discrepancy | `SYN-DSP-RECEIPT-READY`, order ID `7c3a8ad3-ac1a-4807-abf1-a3b1aed27490`: **73 ordered / 69 loaded / 66 delivered / 65 received**. Store entered the useful synthetic missing-unit note. Receipt ID `90e9df41-dc7f-4438-b11f-4c79849a1e04` is ISSUE_REPORTED; Exception ID `dfc1c15e-ff08-46c1-87f0-04048920cb4b` is OPEN, with the identical note and quantity facts in Dispatcher. The order is RECEIPT_ISSUE, not cleanly closed. |

Automated API checks additionally reject Loader, Driver and Store access to all Dispatcher endpoints, identity/scope injection and foreign IDs. Full operational Loader/Driver execution remains a later milestone.

## TESTS RUN

The concluding regression run passed all 134 cases after the calendar-count correction and a bounded retry adjustment for concurrent Store order creation. Existing serialization conflicts now use up to five retries with exponential backoff after rollback. Unique-key errors, business-rule conflicts and duplicate/stale receipt conflicts are not retried; the concurrency assertion still requires all three independent order submissions to succeed. Order creation has no submission idempotency guarantee.

| Command | Evidence |
| --- | --- |
| `npm.cmd run typecheck` | PASS, including API tests and scripts |
| `npm.cmd run lint` | PASS |
| `npm.cmd run test` | PASS: 134/134, including all 102 prior cases and 32 Dispatcher cases |
| `npm.cmd run build` | PASS, shared/API/web production build |
| `npm.cmd run check:safety` | PASS: private exclusions and 180 locally available official identifiers checked against application/seed/public bundle |

The real PostgreSQL runner applies all five migrations on a fresh database, repeats migration/seed, verifies M1 user/password/session preservation and M2 requested/eligible dates plus **73/69/66/65** quantities, and uses separate domain/Store/Dispatcher databases. Dispatcher coverage includes scope/default denial, malformed relationships, dates, all filters, pagination, complete metrics, repeated deferrals, trip sequence, safe issue metadata, same-record Store handoffs and no operational writes on GET.

The index-only migration adds `Order(eligibleDeliveryDate,status)` for initial eligible-demand/date-status queries and `Exception(createdAt,id)` for deterministic sorted paging. It changes no domain state and preserves previous migration history.

## MANUAL VERIFICATION

- The normal preview was restored on localhost:5173 after judge acceptance. The web page and `/api/health` both returned HTTP 200 with the database connected. A Dispatcher browser sign-in showed the explicitly assigned main synthetic depot, its persisted Oct 5 order and default date. Main and judge data were preserved; the separate judge preview was stopped.
- Actual Store-to-Dispatcher order and new receipt-exception handoffs passed; SQL reconciliation used read-only queries.
- All six views fit at **1440, 1280, 768 and 390 px**. `documentElement.scrollWidth` equals `clientWidth` in every case; [geometry evidence](screenshots/dispatcher-responsive-checks.json). At 1440 the Planning areas sit side by side; 1280 stacks the explanation area, and phone widths stack the workspace. Wide desktop/tablet tables scroll within their container; phones use cards.
- Search, requested-vs-operational dates, pagination, repeated deferrals, date change/navigation/reload, invalid-date recovery and unknown/non-operating-day Planning were exercised. Direct foreign order and trip links display not-found states with no foreign reference rendered.
- All three planning actions were observed disabled. Future Capacity states that prediction outputs are not connected.
- Full-row fingerprints of Order, Trip, TripStop, Allocation, PlanningRun, Exception, Receipt and AuditEvent were unchanged across Dispatcher navigation and the above read-only checks: **17 orders, 6 prepared trips, 7 stops, 7 prepared allocations, 6 prepared planning runs, 3 exceptions, 3 receipts, 74 audit events**. The six-trip/allocation/run records pre-existed in the explicit fixture; GETs added zero plans, trips or allocations and changed zero order states.
- Screenshots: [Pulse](screenshots/dispatcher-pulse-1440.png), [Store-created order](screenshots/dispatcher-store-order-handoff-1440.png), [receipt handoff](screenshots/dispatcher-receipt-handoff-1440.png), [Planning 1440](screenshots/dispatcher-planning-1440.png), [Planning 1280](screenshots/dispatcher-planning-1280.png), [Routes](screenshots/dispatcher-routes-1440.png), [phone Orders](screenshots/dispatcher-orders-390.png), [phone Exceptions](screenshots/dispatcher-exceptions-390.png).

## DOCKER VERIFICATION

`docker --version` failed because the Docker command is unavailable. No Compose build/startup/runtime acceptance is claimed. Local embedded PostgreSQL and production web/API builds passed independently of Docker.

## RESULT

**PASS — local Milestone 4 acceptance.** Docker runtime acceptance remains unverified.

## REMAINING RISKS

- No allocation engine, generated feasibility/explanations, automatic deferral, validation/publication or exception resolution is connected.
- Official calendar data ends on 2026-06-28; current official future ordering needs a refreshed verified calendar. Synthetic fixture days and the judge's future dates are explicitly independent review data. Prepared timestamps are authored fixture history, not evidence of actual operations.
- Day-specific fleet availability, verified opening fuel balances and coordinates/live GPS are unavailable. Binary proof storage, physical mobile keyboard behavior, production-scale load, Docker runtime and deployment remain unverified.
- Browser review preserves its newly entered order and receipt; fixture installation is idempotent and does not reset them. Repeat submission of the receipt correctly conflicts. Use an explicitly prepared fresh scenario for another end-to-end receipt demonstration.

## NEXT MILESTONE

**Milestone 5 — Allocation Engine. Not started.**
