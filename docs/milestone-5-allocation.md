# MILESTONE 5 — ALLOCATION ENGINE

**Historical milestone record.** Test counts, screenshots, benchmark measurements, generated synthetic scenarios and next-milestone statements below describe the dated allocation snapshot. They are acceptance evidence, not plans retained in the current live starter system. See [production starter readiness](production-starter-readiness.md) for the current release and its normal production dates.

Review date: 2026-10-04 · Asia/Colombo. Milestone 5 only; Loader operational work is not started.

## COMPLETED

Real Generate → inspect → independent Validate → confirmation Release is implemented and locally verified. PostgreSQL stores PlanningRun, Trip, TripStop, Allocation, DeferralRecord and AuditEvent. All 134 previous tests remain passing; 90 allocation tests bring the final suite to 224. The submitted three-area Planning Studio and all 13 original prototype files are preserved. Milestone 6 was not started.

## FILES CHANGED

- `apps/api/src/planning/`: model, timing, candidate constraints, deterministic engine, independent validator, data snapshots/eligibility, services, routes, tests and independent synthetic fixtures.
- `apps/api/src/{app,config}.ts`, Dispatcher services/DTOs and central domain lifecycle/scope/audit support: authenticated endpoints, explicit fixture configuration, real capabilities, generated-trip provenance, authorized transitions and preview isolation.
- `packages/shared/src/{planning,dispatcher,index}.ts`: strict action inputs and planning/constraint/validation contracts.
- `prisma/schema.prisma`; additive migrations `20261003000500_allocation` and `20261004000600_allocation_history`: availability, versioned runs, timing, fuel estimates, superseded slots and released-history guards. Previously applied migration checksums were not rewritten.
- `apps/web/src/dispatcher/`: Planning, PlanTrips, PlanEvidence, PlanReleaseDialog, planningApi and planning styles; Pulse/Routes/Shell integration labels and navigation.
- `scripts/{setup-allocation-judge,dev-allocation-judge}.mjs`, `allocation-judge-fixtures.ts`, test/migration regression harness; `package.json` and `.env.example`.
- README, architecture, data model, AI disclosure, implementation plan, this report, and safe synthetic screenshots/JSON evidence. Actual `.env`, official datasets and prototype sources were preserved. No Git repository was initialized.

## ALGORITHM

`deterministic-depot-v1` plans one explicitly selected assigned depot and one persisted operating service day. It evaluates two trip slots for every vehicle master in scope, applies all blocking constraints, then chooses a feasible candidate using the tie-breakers below. It never imports the old allocation CSV or calls an LLM/ML service. This heuristic is not a claim of global optimality.

Existing trips are not modified or appended to. They consume daily slots and already recorded fuel, and their departure/return facts bound new trip timing. Unknown availability, required references, existing timing or remaining fuel block the affected candidate. Excess demand gets a retained DEFERRED decision with machine-readable checks and a safe summary of all observed blocking constraint types.

## PRIORITIZATION POLICY

Demand is ordered lexicographically: prior deferral count descending; structurally compatible available vehicle count ascending; effective receiving-window width ascending; initial eligible date ascending; creation instant ascending; unique order reference ascending. Prior deferrals improve priority but never override feasibility. Compatible vehicle count describes depot/type/temperature/explicit availability compatibility and is not a guarantee of time, capacity or fuel feasibility.

Superseded attempts for this same depot/service day retain their history but do not inflate that day's priority count or postpone their own regeneration. Deferrals from unrelated runs/days remain authoritative.

Feasible candidates compare, in order: fewer unnecessarily consumed reefer/van capabilities; filling an existing new draft trip before creating another; lower incremental estimated fuel; lower remaining weight fraction; lower remaining volume fraction; earlier return; vehicle reference; trip number. Weight and volume remain separate capacity dimensions. Stable references resolve ties independently of database insertion order.

## HARD CONSTRAINTS

Recorded operating day, matching depot, active master and explicit daily availability, enum temperature compatibility, van-only access, both decimal capacity limits, at most two active trips per vehicle/day, known available weekly fuel, receiving/mall windows, Fresh deadline and full trip time feasibility are blocking. AMBIENT can use AMBIENT or REEFER; CHILLED/FROZEN require REEFER because the source capability model has no finer refrigeration setting. No absent height/road-weight restriction is invented.

## FUEL HANDLING

An opening balance is required. Weekly quota alone never means zero prior consumption. Remaining fuel subtracts the opening consumed balance, active consumption and other active reservations; new trip estimates are reserved transactionally. Fuel is reference distance divided by recorded km/litre, rounded upward to 0.001 litre per trip. Validation recomputes the complete new fuel total and excludes only the current run's own reservation from available input. Synthetic opening/usage records are labelled and cannot authorize production planning.

## TRAVEL / TIMING MODEL

All travel lookups retain depot **and** district. Outbound and return legs use the corresponding depot/district reference. Same-district consecutive stops use its inter-stop distance/time. Different districts use a conservative via-depot estimate: previous district return plus next district outbound. This is a deterministic reference model, not GPS routing or a precise road itinerary.

Stops sort by effective closing deadline, receiving opening and order reference. Receiving begins at the later of reference arrival and the outlet/mall opening; waiting is recorded separately. Brand/dock service allowance determines completion, which must fit every applicable closing window. The brief requires Fresh before 08:00; this strategy enforces receiving service start strictly before 08:00 as well as the individual outlet window. Vehicle departure/return must fit explicitly recorded daily availability. A 15-minute depot turnaround between vehicle trips is a conservative strategy assumption, not a supplied loading measurement. Travel/service durations round upward to whole seconds. Planned instants use Asia/Colombo; actual timestamps are untouched.

## EXPLAIN MY PLAN

Served decisions retain real final-trip checks with actual/required values and limited genuinely rejected alternatives. Deferred decisions show the union of observed blocker codes rather than claiming one arbitrary cause. At most three candidate alternatives are shown. These are generation evidence; they are distinct from independent final validation. Capacities show separate used, remaining and percentage values for weight and volume.

## VALIDATOR

The validator does not call the allocator or its candidate evaluator. It independently checks exactly-once decision coverage, served stop links, deferral reasons/no assignment, source order versions, depot, daily availability, temperature/access, summed capacities, existing plus generated trip limits, sequence, reference-clock recomputation, windows/mall/Fresh and complete vehicle fuel. It shares the declared reference timing model, compares stored times against recalculation and does not trust stored green checks. Invalid results cannot release.

## PLAN RELEASE

Generation writes a DRAFT run, DRAFT trips, planned active stops, Allocation decisions, fuel reservations, deferral records and audits in one Serializable transaction. Served orders use the central lifecycle to enter CLOSED_FOR_PLANNING; deferred orders enter DEFERRED with the next permitted operating date when known. Validation independently checks persisted results, marks valid trips PLANNED and served orders PLANNED. Release requires the current run version, a valid stored validation and a matching source snapshot, then repeats freshness and independent validation inside a Serializable transaction. It marks the run/trips RELEASED and centrally moves served orders to RELEASED_TO_LOADING with audits. Any action/audit failure rolls back the complete transaction; serialization/uniqueness conflicts require reload rather than blind retries.

Snapshots cover eligible demand, original quantities/dates, outlet rules, calendar, vehicle capacities, daily availability, fuel opening/usage, travel/service references and existing trips. Relevant changes, newly eligible demand or lost scope prevent release. A current unreleased run can be regenerated only with its identifier/version: the transaction marks it SUPERSEDED, cancels its stops/trips, voids only its own reservations and retains decisions, explanations and deferral history. Own superseded same-day deferrals can be reconsidered; unrelated postponements remain authoritative. Released runs cannot be regenerated. Historical Planning Studio evidence uses captured source facts. Generated previews are excluded from Loader/Driver reads; released trips are ready for scoped Loader access in Milestone 6. Loader/Driver operational UI is out of scope.

## SYNTHETIC JUDGE SCENARIO

The independent judge database is `/waypoint_allocation_judge`, with selected service day **2040-03-05**. Setup creates no precomputed plan. Explicit synthetic orders, daily availability, weekly fuel, calendar and travel/service facts drive the engine. Repeated setup preserves actual Store submissions and generated/released history. Fresh isolated test databases provide repeatable clean scenarios.

Run `npm run demo:allocation-judge` after `npm run dev:db`, then `npm run dev:allocation-judge` for localhost:5176. Private `.env`, main development data and the M4 judge database are not overwritten.

The judge has 12 eligible own-depot orders plus one excluded foreign-depot order; seven vehicle masters include explicit available ambient/reefer/van candidates, a fuel-limited truck, an unavailable reefer, an unknown vehicle and an inactive master. Two districts provide independently authored travel references. Demand includes ambient, chilled, frozen, van-only and mall receiving rules, past deferrals, overweight and over-volume cases, and an infeasible chilled van-only case. Weekly opening consumption plus explicit consumed/reserved usage prevents treating quota as unused fuel. No prepared trip or allocation is installed.

## TESTS RUN

| Command | Result |
| --- | --- |
| Pre-change `npm.cmd run test` | PASS: 134/134 before major M5 implementation |
| Final `npm.cmd run typecheck` | PASS: shared, API, web, tests and scripts |
| Final `npm.cmd run lint` | PASS |
| Final `npm.cmd run test` | PASS: 224/224 across 7 files; Vitest duration 117.52 seconds |
| Final `npm.cmd run build` | PASS: shared/API/web production builds |
| Final `npm.cmd run check:safety` | PASS: private exclusions and all 180 locally available official identifiers checked against frontend/shared/auth seed/public bundle |
| `npm.cmd run demo:allocation-judge` | PASS: fresh/repeated setup; repeated setup after release preserved exact planning evidence |

The test runner applies all seven migrations to fresh isolated PostgreSQL databases, repeats migration/seed, and verifies M1 upgrade preservation of four users/password hashes/session and M2 preservation of requested/eligible dates and **73/69/66/65** quantities. The migration comparison ignores only the three newly added nullable TripStop timing fields; all prior facts remain compared. Final suite: 134 retained authentication/domain/Store/Dispatcher tests, 61 pure constraint/engine/validator tests and 29 allocation API/integration tests.

Coverage includes all temperature/access/depot/capacity/window/mall/Fresh/fuel/calendar/trip boundaries; deterministic results and reversed input insertion order; scarcity and prior deferral priority; deliberately malformed hand-authored validator plans; ineligible/foreign/already assigned demand; same-day draft regeneration/history; stale orders/resources/new eligible demand; exact own reservations and missing/voided/wrong reservations; Loader denial before release and scoped access after release; release/double-release guards, final audit rollback and SQL released-history protection. An actual Store API submission retains the same Order ID through Dispatcher context, generation, validation, release and role reads. Loader/Driver operational UI remains unimplemented.

## PERFORMANCE

Independently synthetic **120 distinct outlets / 120 orders / 60 vehicles / 4 districts** with mixed temperature/access: generation **1,533.73 ms**, independent validation **14.80 ms**, 120 served across 33 trips. The full persisted API test scenario, including a Store-created order, generated 13 decisions (9 served / 4 deferred / 6 trips) in **645 ms**. Browser judge generation took **679 ms**, then **673 ms** on regeneration for 12 decisions (8 served / 4 deferred / 5 trips).

These are local development measurements, not production latency guarantees. The bulk source read avoids per-vehicle database lookups; no complex solver dependency was added. Safe recorded metrics: [network benchmark](screenshots/allocation-benchmark.json), [persisted API benchmark](screenshots/allocation-api-benchmark.json).

## MANUAL VERIFICATION

All 19 requested steps passed on **2026-10-04**, using `http://localhost:5176` and selected synthetic day **2040-03-05**:

1. Dispatcher login succeeded with the scoped demo account.
2. Opened Planning Studio with the submitted layout.
3. Confirmed selected judge day and synthetic operating-calendar provenance.
4. Saw 10 confirmed previews plus 2 eligible deferred backlog previews.
5. Clicked Generate Plan; no prepared allocation was installed.
6. Saw 12 persisted decisions: 8 served, 4 deferred, 5 draft trips.
7. Selected served assignments, including CHILLED.
8. Explain My Plan showed its real REEFER assignment, capacities, times and fuel checks.
9. Expanded the ambient alternative; TEMPERATURE was blocked.
10. Inspected COLD-VAN deferral: multiple recorded blockers and no assigned trip, next eligible Mar 7.
11. Regenerated the unreleased draft, retained all 12 decisions/history, then clicked Validate Plan.
12. Saw independent Plan valid with zero blocking issues and version 2.
13. Clicked Release Plan.
14. Reviewed the depot/day/8 served/5 trips/version 2 dialog and clicked Confirm Release; run became RELEASED version 3.
15. Pulse refetched: awaiting planning 0, planned 0 after release, deferred 4, loading/ready 8, 5 active generated trips.
16. Orders refetched: eight Ready for loading and four Deferred, with retained historical deferrals.
17. Routes Released filter showed five generated released trips and their real stop manifests.
18. Reloaded the browser.
19. Five released trips and the RELEASED version 3 run remained persisted; validation/release/destructive regeneration were unavailable.

No direct database edits occurred during this walkthrough. Afterwards, read-only reconciliation confirmed two run revisions, 12 decisions per revision, 8 active released stops, 8 retained generated deferrals and 2 PLAN_GENERATED / 1 PLAN_VALIDATED / 1 PLAN_RELEASED run audits. Repeating fixture setup after release preserved the exact reconciliation file hash. Run identifiers: revision 1 `c19a9709-200d-4dd3-a406-790cfa16e953` SUPERSEDED; revision 2 `4131d5ce-8b4b-4237-b4fc-de9d03064db2` RELEASED. [Persisted evidence](screenshots/allocation-persisted-results.json).

Planning was checked at **1440, 1280, 768 and 390 px**: no horizontal page overflow. Three areas sit side by side at 1440; the inspector stacks at 1280/768 and all areas stack on phones. Phone assignment selection rendered the correct explanation. [Geometry](screenshots/allocation-responsive-checks.json), [generated plan](screenshots/allocation-generated-1440.png), [rejected alternative](screenshots/allocation-rejection-1440.png), [deferral](screenshots/allocation-deferred-1440.png), [confirmation](screenshots/allocation-release-confirmation-1440.png), [released plan](screenshots/allocation-released-1440.png), [Routes](screenshots/allocation-routes-1440.png), [phone explanation](screenshots/allocation-explanation-390.png).

The allocation judge preview remains available on localhost:5176. Web and `/api/health` returned HTTP 200 with the database connected. Main development and the previous Dispatcher judge databases were preserved. Original prototype SHA256 verification: **13/13 unchanged**.

## DOCKER VERIFICATION

`docker --version` failed because Docker is unavailable on this machine. No Compose build/startup/runtime or deployment acceptance is claimed. Docker configuration/private exclusions remain maintained; local PostgreSQL and production builds passed separately.

## RESULT

**PASS — local Milestone 5 acceptance.** Every listed M5 acceptance item passed through the automated suite and/or the requested browser journey. Docker runtime and deployment remain unverified.

## REMAINING RISKS

The reference travel model and turnaround assumption are conservative planning approximations. Official future calendar coverage, authoritative daily availability and historical opening fuel data need verified operational inputs. Live GPS, Loader/Driver workflows, offline synchronization, proof binary storage, ML and deployment remain later work.

## NEXT MILESTONE

Milestone 6 — Loader. **Not started.**
