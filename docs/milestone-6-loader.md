# MILESTONE 6 — LOADER

Review date: 2026-10-04 · Asia/Colombo. **Local acceptance PASS.** Driver/offline work is not started.

## COMPLETED

- Real released generated PlanningRun → Trip → TripStop loading workflow.
- Persisted checklist/counts, shortfalls, Dispatcher approve/reject, correction history and readiness.
- Server scope, optimistic versions, transactional lifecycle/audit and query refresh.
- Full browser 192 → 188 approval/readiness journey and Store propagation.
- All required commands passed; 13/13 original prototype hashes unchanged.

## FILES CHANGED

- API: apps/api/src/loader/{dto,services,routes,loader.api.test}.ts and testing/synthetic.ts; app.ts; dispatcher/{routes,services}.ts; domain/{audit,lifecycle}.ts.
- Shared: packages/shared/src/{loader,dispatcher,index}.ts.
- UI: apps/web/src/loader/ (nine files); Shell.tsx; dispatcher/Exceptions.tsx.
- Persistence: prisma/schema.prisma and additive 20261004000700_loader/migration.sql. No new models or quantity columns.
- Scripts: setup-loader-judge.mjs, dev-loader-judge.mjs, loader-judge-fixtures.ts, isolated Loader database in scripts/test.mjs, package.json commands.
- This report, necessary README/architecture/data-model/AI disclosure/implementation-plan sections and docs/screenshots/loader-* evidence.

## LOADER SCOPE

Current role/UserDepot is resolved from the session inside each transaction. Client actor/depot fields are rejected. Scope checks matching vehicle/run/stop/order/outlet/allocation relationships and no departure. Missing assignment, foreign scope and wrong-role access are tested. Mutations require trip/order/load versions and stop.updatedAt; stale/concurrent requests cannot partially write.

The local judge explicitly assigns loader@waypoint.local and Dispatcher through UserDepot to **SYNTHETIC Allocation LOADER Depot**. Auth seed grants no assignments.

## RELEASED TRIP VISIBILITY

Only current released generated runs appear for the selected day; draft, validated-unreleased, superseded/cancelled and foreign trips are excluded by API tests. No separate Loader trips are seeded.

Browser run **042f4e02-0bbe-4124-a02c-03a0607d8478**, day **2040-03-05**, generated **13 eligible decisions, 9 served, 4 deferred, 5 trips**. Loader displayed the five real released manifests.

## NORMAL LOADING

Mark Loaded persists actual=expected, recorder/time and revision separately from immutable Order.orderedUnits. Browser stop 2 saved **25/25** and retained it after reload; stops 3/4 later saved 25 each. Sequence matched the planner: ORDER-192 → NEWER-AMBIENT → PREVIOUSLY-DEFERRED → MALL. Delivered/received stay separate.

## LOADING SHORTFALL

Browser stop 1 retained **192 ordered/expected**, recorded **188 loaded**, STOCK_UNAVAILABLE and a note. The transaction created LOADING_SHORTFALL exception **9310af6e-fe80-45fa-a8b2-d138ae8681a0**, pending review and central LOADING_EXCEPTION. Loader displayed Awaiting approval and blocked readiness; tests independently verify the server guard.

Reasons: STOCK_UNAVAILABLE, DAMAGED_BEFORE_LOADING, COUNT_MISMATCH and OTHER with a useful note. Invalid counts/reasons, injected identity and overwrite attempts leave no partial data. No automatic approval or scanner/temperature telemetry.

## DISPATCHER REVIEW

Exception Centre read the same exception and 192/188 facts. Browser approval persisted APPROVED, reviewer/time and resolved the exact exception without changing ordered/loaded quantities. Loader re-login displayed Approved revision.

Tests also prove rejection remains blocked and a versioned correction retains the old 188/REJECTED audit snapshot and original Exception message. Rejection/correction is automated acceptance; the browser walkthrough exercised approval.

## READY FOR DISPATCH

The server requires satisfactory complete loads for every active stop, approved lower quantities and no unresolved linked blocking loading exception. Loader then persisted **Trip and four Orders READY_FOR_DISPATCH**, retained after reload. Manifest total: **267 expected / 263 loaded**.

Read-only database reconciliation confirms actualDeparture=null, zero DeliveryRecord/Receipt rows, four LOAD_RECORDED, one LOADING_SHORTFALL_REPORTED, one MANIFEST_REVISION_APPROVED and five READY_FOR_DISPATCH events (four order transitions plus one trip event). Duplicate readiness produces no duplicate audit/departure. No IN_TRANSIT transition was added.

## CROSS-ROLE VERIFICATION

Dispatcher generated/validated/released; Loader operated its exact stops; Dispatcher approved the exact exception; Loader saw approval. Existing Store tracking for that same order displayed **192 originally ordered / 188 actually loaded**, Ready for dispatch, resolved shortfall and delivery/receipt Not recorded. No receipt changes were needed.

Driver/Store cannot mutate Loader records; Loader cannot approve itself; unrelated depots are denied by tests. TanStack mutations invalidate Loader/Dispatcher/Store queries; ten-second Loader polling and refetch/re-login expose review decisions.

## TESTS RUN

| Command | Result |
| --- | --- |
| npm.cmd run typecheck | PASS, full workspace/scripts |
| npm.cmd run lint | PASS, full workspace |
| npm.cmd run test | **PASS 246/246**, 8 files, **171.69 s** |
| npm.cmd run build | PASS, shared/API/web; final Vite build 1.61 s |
| npm.cmd run check:safety | PASS, private exclusions and 180 local official identifiers checked against public source/build |

All **224 earlier tests** remain, plus **22 Loader cases**: released visibility, roles/depot scope, normal persistence, reasons, 192/188 separation, pending holds, approve/reject/correction history, readiness/idempotence, four optimistic tokens, concurrent loads, read-only queries and loading/review/ready audit rollback. Eight migrations passed fresh/repeat installation and earlier upgrade preservation. Evidence: .local/m6-test-final.log. Prototype SHA256: **13/13 unchanged**.

After the final review-history read adjustment, a fresh focused run passed **22/22 Loader tests** in **25.14 s** (13:18:15–13:18:40 Asia/Colombo). All 12 captured relevant source/test/harness hashes were identical before/after. Evidence: .local/m6-loader-latest.log. The earlier full 246-test result is retained; the final loading/history branch was verified against unchanged final files.

## MANUAL VERIFICATION

Completed Dispatcher Generate → Validate → Release → Loader normal load/reload → 192/188 shortfall → Dispatcher approve → Loader approval/remaining loads → Ready/reload through product controls, with **no direct database edits during the walkthrough**. Subsequent reconciliation was read-only. An unused VAN shortfall dialog was inspected and cancelled without saving.

Today's Loads and Load Detail passed **360/390/768px** inspection. Document widths: 345/375/753 respectively (viewport minus scrollbar), no horizontal page overflow. Open Load targets ≥47px; search/quantity inputs 50px; reason selector 49.5px; close 44px and submit/cancel 68px at 390px. Native dialog Tab reached quantity; Escape cancelled. Phone bottom padding 108px clears the 66px fixed navigation. Tablet loading/readiness actions worked.

- [Entered 390px shortfall](screenshots/loader-shortfall-390.png)
- [Awaiting approval](screenshots/loader-awaiting-390.png)
- [Dispatcher approval](screenshots/loader-dispatcher-approved.png)
- [Tablet readiness](screenshots/loader-ready-768.png)
- [Completed manifest proof](screenshots/loader-ready-proof.png)
- [Phone readiness](screenshots/loader-ready-360.png)
- [Store propagation](screenshots/loader-store-tracking.png)
- Load-list evidence: loader-loads-360.png, loader-loads-390.png, loader-loads-768.png.

Preview remains **http://localhost:5177** (API 3004), web HTTP 200 and /api/health database connected. Completed Loader manifest is left open. .env, main development, M4 and M5 judge data are preserved; the old M5 preview was stopped and its database retained.

Prepare with npm run demo:loader-judge; run with npm run dev:loader-judge. The separate waypoint_loader_judge installs independent allocation references/demand only, with day 2040-03-05 and controlled assignments. Repeated setup preserves history (tested); this completed scenario is already released/ready and repetition does not reset it or pretend to generate another plan.

## DOCKER VERIFICATION

**Unverified:** Docker CLI is unavailable. Local database/build/browser acceptance does not establish container/deployment acceptance.

## RESULT

**PASS — Milestone 6 local acceptance.** Every requested acceptance item is covered by browser evidence or explicit API tests. Driver/offline work is not started.

## REMAINING RISKS

Manual counts depend on Loader input; scanner/reefer telemetry are absent. A physical phone's onscreen keyboard was not tested. Official future operation requires refreshed verified calendar/reference context; the judge is SYNTHETIC. Docker/deployment and Driver delivery/proof/offline remain separate acceptance work.

## NEXT MILESTONE — Milestone 7 — Driver

Not started. Await milestone approval.
