# MILESTONE 7 + 8 — DRIVER / OFFLINE

Combined local acceptance on 2026-10-04. This report covers Driver execution and offline/sync recovery only. Final integration, packaging, deployment and Datathon work have not started. The supplied prototype remains unchanged; all 13 original file hashes match the earlier baseline.

## COMPLETED

- Connected actual Generate → Validate → Release → assign Driver → Loader revision/review/readiness → Driver delivery → Store/Dispatcher reads using one persisted generated plan.
- Implemented assigned ready routes, transactional start/arrival/outcomes/proof/finish, durable offline operations, offline reload, ordered reconnect, idempotent replay and retained conflicts.
- Preserved ordered, loaded, delivered and received quantities independently. No Driver action creates a Store receipt.
- Reviewed Today, Route, Proof and Offline / Sync at 360px and 390px in the built browser preview.

## FILES CHANGED

| Area | Files and purpose |
| --- | --- |
| Shared contracts | `packages/shared/src/driver.ts`, `dispatcher.ts`, `index.ts`: strict Driver actions, versions, route/proof DTOs, sync results and Driver assignment |
| API | `apps/api/src/driver/{scope,dto,services,routes,driver.api.test}.ts`; API mount, Dispatcher assignment/routes/DTOs, domain read guards and audit types |
| Database | `prisma/schema.prisma`, `prisma/migrations/20261004000800_driver_offline/migration.sql`: ninth additive migration and OfflineOperation, retaining earlier migrations |
| Driver UI | `apps/web/src/driver/`: Today, Route, Proof, Sync, shared controls and responsive styles; existing Shell/navigation/Dispatcher Routes integration |
| Offline/auth | `apps/web/src/offline/`: scoped IndexedDB, local projections, ordered queue, synchronization, shell readiness and regression tests; existing auth/login integration |
| PWA/build | `apps/web/public/{sw.js,manifest.webmanifest}`, `index.html`, `main.tsx`, `vite.config.ts`, Web package script, `scripts/build-web.mjs`, Web Dockerfile |
| Judge and verification | `scripts/{setup-driver-judge,dev-driver-judge}.mjs`, `driver-judge-fixtures.ts`, `assign-driver.ts`, root package scripts, test runner, migration regression and Vitest configuration |
| Documentation | README, architecture, data model, AI disclosure, implementation plan, this report and synthetic browser screenshots |

No dependency was added. The private reference importer and installation auth seed were not expanded to seed operational competition data. Two prior domain-read expectations were tightened to deny nonready Driver fixtures; all 246 earlier test cases remain.

## DRIVER SCOPE

The server resolves the active account and `Trip.driverUserId`, with released GENERATED planning provenance, matching stop/allocation relationships and satisfactory loading. Only assigned READY_FOR_DISPATCH, IN_TRANSIT and COMPLETED trips are visible. Foreign, draft, unreleased, prepared legacy and loading-blocked trips are denied on direct reads and mutations. No frontend actor or depot field grants access.

Dispatcher's existing Routes / Trips screen assigns an active Driver using the scoped/versioned `/dispatcher/trips/:id/driver` action before departure. Auth seeding grants no trip assignment. Driver API reads use RepeatableRead; mutations use Serializable transactions and expected trip/stop/order versions.

## TRIP START

Start persists actualDeparture, advances the same ready orders to IN_TRANSIT through the central lifecycle service, and commits audit events with the trip change. The next active stop follows persisted sequence. Arrival records actualArrival, increments versions and advances ARRIVED before delivery can be recorded. Finish requires every stop to have a terminal outcome, writes COMPLETED and completedAt, and leaves actualReturn null because depot return was not captured.

## DELIVERY OUTCOME

| Outcome | Guard | Persisted behavior |
| --- | --- | --- |
| DELIVERED | Delivered equals actual loaded quantity; recipient name and role required | DeliveryRecord/proof; central DELIVERED → AWAITING_RECEIPT |
| PARTIALLY_DELIVERED | Positive quantity below actual loaded; controlled reason; recipient metadata | Retained partial state and actionable delivery exception |
| FAILED | Zero delivered; controlled reason | Retained failed state and actionable delivery exception |

OTHER, DAMAGED_IN_TRANSIT and QUANTITY_REJECTED require a useful note. Excess quantities, missing arrival, wrong sequence, stale versions and repeated completion are rejected. Delivery, proof, stop/order transitions, audit and successful sync result commit atomically. No ordered/load fact is rewritten.

## PROOF

Proof stores recipient name/role with delivery outcome, actual quantity, driver note and event time. Pending local proof is labelled separately from synced server proof. Photo/signature capture or binary storage is unavailable; there are no fake images, blob URLs or signature claims. The 192-unit order retains the offline recipient **SYNTHETIC Receiver / Receiving staff** and its note after synchronization and reload.

## STORE / DISPATCHER PROPAGATION

The browser completed all four stops of the same generated trip:

| Stop | Ordered | Loaded | Delivered | Outcome |
| --- | ---: | ---: | ---: | --- |
| 1 | 192 | 188 | 188 | Delivered offline, then synced |
| 2 | 25 | 25 | 20 | Partially delivered, quantity rejected |
| 3 | 25 | 25 | 0 | Failed, outlet closed |
| 4 | 25 | 25 | 25 | Delivered online |
| Total | 267 | 263 | 233 | Trip completed, 4/4 stops |

Store tracking showed **192 ordered / 188 loaded / 188 delivered / received not recorded**, AWAITING_RECEIPT and the actual recipient/note on that same order. Dispatcher showed completed trip progress and the same partial/failed exceptions. Read-only reconciliation found four DeliveryRecords, three recipient proofs and **zero Receipts**. The resolved loading shortfall remained in history.

## OFFLINE ARCHITECTURE

The built application registers a versioned service worker that precaches index, manifest, logo and generated JS/CSS. Navigation can reload the shell offline. Authenticated `/api` responses and cross-origin requests are excluded from the service-worker cache.

Native IndexedDB `waypoint-driver-v1` stores per-user routes, sanitized Driver identity, operations and metadata. The route key includes user and service date. The cached identity contains only id, email, role and displayName; passwords, session tokens and raw competition data are absent. The browser inspected one scoped cache containing only the two assigned ready trips, with an 8,558-byte serialized route record.

`useDriverWorkspace` exposes server routes, cached routes, cache timestamp and local projections separately. Every UI action is saved durably first, including actions recorded online. Cached/local/pending indicators remain visible. Only network failure permits the active cached Driver fallback; server 401 hides it. Logout refuses offline or unsynced work and clears only the successful account's local records after server logout. Session-generation checks prevent late auth/route callbacks from recreating cleared cache, including another same-origin tab. A non-secret localStorage generation marker coordinates tabs; it is not an authentication credential and grants no server access. If shared storage is blocked, offline identity/cache access fails closed.

The Web build wrapper forces NODE_ENV=production for Vite even when ignored local `.env` selects development. This was necessary to emit the production React bundle and retain the SW registration. The Web Dockerfile copies that wrapper before building; its current container runtime remains unverified.

## SYNC / IDEMPOTENCY

Operations retain UUID, authenticated owner, entity/action/payload, base version, createdAt, clientEventAt, recordedOffline, status, attempts and server result. Client state is PENDING/SYNCING/SYNCED/FAILED/CONFLICT. Arrival precedes completion by trip/version/action order; synchronization stops dependent actions after any nonsuccess. Reconnect, 30-second retry and manual Sync now use the original UUID and payload.

`POST /driver/sync` accepts up to 20 sequential operations. OfflineOperation persists canonical payload identity and transactional result. The same account/UUID/payload returns the frozen success or conflict; changed identity/payload conflicts. FAILED may retry unchanged. Successful replay creates no extra delivery or audit. Tests cover replay, changed payload, stale versions, transaction rollback, concurrency and sequencing. The main browser trip produced ten SYNCED operations with exactly one OFFLINE_ACTION_SYNCED audit per UUID.

Fresh online queued actions use server event time. Offline/delayed actions retain client event time separately from server receivedAt, with a seven-day age bound, five-minute future/creation skew bound and departure/arrival ordering checks. The 30-second connected-action threshold does not invent GPS verification. The fixture's 2040 service day is planning context; actual execution timestamps are on 2026-10-04.

## CONFLICT HANDLING

A second assigned/generated/ready trip was started through the product. One online Driver tab recorded arrival at version 7 → 8. Another tab, genuinely offline with version 7 cached, saved an arrival and delivery proof. Reconnect produced an ARRIVAL CONFLICT with serverVersion 8. Its dependent completion remained PENDING, with recipient/note preserved.

Reload and Sync now retained the conflict and local proof; route actions were disabled for the conflicted trip. Read-only PostgreSQL reconciliation found the authoritative stop ARRIVED, one arrival audit, zero delivery/proof/receipt and no completion audit. The local completion was never sent past the conflict. The UI exposes the reason and advises Dispatcher review; automatic conflict resolution/discard or a new review workflow is outside this milestone.

## BROWSER OFFLINE WALKTHROUGH

The independent judge database is `waypoint_driver_judge`, service day **2040-03-05**, built Web **http://localhost:5178**, API **3005**. Setup authored SYNTHETIC demand/references and assignments only; no plan/trip/delivery was precomputed. Main and earlier judge databases and ignored `.env` were preserved.

1. Dispatcher generated 13 decisions, nine served orders, four deferrals and five trips; validated and released the actual plan; assigned Driver to the first ambient trip.
2. Loader reported 192 → 188 with STOCK_UNAVAILABLE. Dispatcher approved that same revision; Loader completed the other loads and marked Ready for Dispatch.
3. Driver cached the route online, confirmed Offline reload ready and started the trip online.
4. Browser network emulation was switched offline. Driver recorded first-stop arrival and 188-unit delivery with recipient/note; two operations were visibly pending.
5. Reload while still offline retained route, arrival and proof. Sign-out was refused and did not remove local work.
6. Restoring actual network automatically synchronized arrival then completion; pending count reached zero. Online reload showed synced server proof.
7. Missing-reason partial and failed submissions were rejected in the browser. Corrected submissions and the final full delivery persisted. Finish/reload showed Completed, 4/4.
8. Store and Dispatcher verified the same IDs, quantities, proof, progress and exceptions. A separate two-tab stale-version exercise verified retained conflict and blocked dependent completion.

No direct database writes were used during either browser journey. Subsequent reconciliation used read-only repeatable-read transactions. Browser network emulation was restored online and viewport overrides reset after review. The retained conflict remains available for inspection.

### Exact synthetic records

| Record | ID / reference |
| --- | --- |
| Generated plan | `d3de636f-c494-49c7-bda8-ae17dc4a9754` / `WP-PLAN-2040-03-05-8fdd155e-53cf-4a0b-b236-1d62461c347f` |
| Completed trip | `8b72700b-2a7c-4fa4-a06e-0062138cf019` / `WP-TRIP-2040-03-05-0c8e2b2a-2492-4fdd-94c7-c0d200a9899a` |
| 192-unit order | `71c27b8b-028e-4ee7-ae3d-d6976a2501a6` / `SYN-LOADER-DRIVER-ORDER-192` |
| Offline first stop | `2f29b25d-48df-41ea-a277-06b487c6c229` |
| Conflict trip | `b5f7a519-5b54-427b-af63-6349f45f1ee0` / `WP-TRIP-2040-03-05-0da7a203-9df0-4214-b044-9853c1d391b3` |
| Conflict arrival UUID | `a84c2564-e0e7-4243-937e-79ce7e70814a` |
| Retained pending completion UUID | `b17fba3c-f57c-4649-a00e-1f211b2ec1f6` |

## TESTS RUN

| Check | Evidence |
| --- | --- |
| Pre-change baseline | 246/246, eight files, real isolated PostgreSQL |
| Final combined full suite | 299/299, eleven files: all 246 earlier, 28 Driver API and 25 client offline/session cases; 138.13 seconds, start 15:34:57 Asia/Colombo |
| Focused client regression | 25/25, including nine delayed-auth/storage/logout/cross-tab cases; 3.32 seconds |
| Migration regression | Nine migrations fresh/repeat, earlier auth and original quantities/dates preserved during upgrades |
| `npm run typecheck` | PASS, shared/API/Web/scripts/test source |
| `npm run lint` | PASS |
| `npm run build` | PASS, shared/API/production Web and generated SW |
| `npm run check:safety` | PASS, 180 local official identifiers against frontend/shared/seed/bundle, Git/Docker exclusions intact |
| `git diff --check` | PASS |
| Prototype hash comparison | 13/13 unchanged |

The final full rerun includes the logout/session fixes. Client session regressions use asynchronous test IndexedDB and a mocked network adapter; the actual session/identity/storage modules are exercised. API cases use real isolated PostgreSQL. The final production build transformed 1,774 modules in 3.21 seconds and emitted the new static shell cache `waypoint-shell-213157d5d2f57016`. Its actual browser offline reload, guarded sign-out and online recovery retained the conflict and dependent proof. Logs and read-only reconciliation JSON are retained under ignored `.local/`; private environment values are not printed or published.

## MANUAL VERIFICATION

Actual browser checks passed for online cache, real offline network, offline arrival/delivery, offline reload, ordered reconnect, synced server proof, logout retention, invalid partial/failed forms, trip finish and cross-role propagation. The separate actual stale-route conflict retained local proof after retry/reload without mutating server completion facts.

At 360/390px, document widths stayed within the viewport. Refresh is 44×44px; proof inputs/selects are 50px tall, textarea 98px and submit 49px; bottom navigation remains accessible. A physical mobile onscreen keyboard was not tested.

| Screenshot | Evidence |
| --- | --- |
| [Offline proof at 390px](screenshots/driver-offline-proof-390.jpg) | Captured local delivery, pending synchronization |
| [Offline reload at 390px](screenshots/driver-offline-reload-390.jpg) | Durable queue after offline navigation reload |
| [Synced server proof](screenshots/driver-server-proof-390.jpg) | Recipient, quantity and note after reconnect/reload |
| [Outcome validation at 360px](screenshots/driver-proof-validation-360.jpg) | Missing required partial reason rejected |
| [Completed trip at 360px](screenshots/driver-completed-360.jpg) | Finished trip and quantities |
| [Route at 360px](screenshots/driver-route-360.jpg), [completed route at 390px](screenshots/driver-route-completed-390.jpg) | Persisted sequence/outcomes and phone layout |
| [Store tracking](screenshots/driver-store-tracking-390.jpg) | 192 / 188 / 188, receipt not recorded |
| [Dispatcher progress](screenshots/driver-dispatcher-progress.jpg), [exceptions](screenshots/driver-dispatcher-exceptions.jpg) | Same trip, stop progress and actual issue notes |
| [Retained conflict at 390px](screenshots/driver-conflict-390.jpg), [Sync at 360px](screenshots/driver-sync-360.jpg) | Structured conflict plus dependent pending proof |
| [Final rebuilt Sync view](screenshots/driver-final-sync.jpg) | Retained conflict/proof after the session-fence fix and repeated genuine offline reload |

## DOCKER VERIFICATION

**Current combined milestone: NOT VERIFIED in Docker.** The earlier pre-Driver source `05e8eb1` passed remote Linux verification of the eight-migration stack; see [the separate remote Docker report](remote-docker-verification.md). That run cannot establish acceptance of the current Driver/offline source or ninth migration.

The root Compose stack, safe auth seed and private-resource exclusions remain in place. The Web image now includes the build wrapper; the existing Docker verifier dynamically enumerates migrations and Prisma models. Local development needs no Docker; competition startup remains `docker compose up --build`. No source was pushed or published as part of this milestone.

The final publication inventory was scanned against all 180 private reference identifiers, four configured local secret values, private-key/credential patterns and forbidden paths. The only reserved private marker allowed is the existing safety checker's defensive literal. Private data, local databases, `.env`, original prototype and the confidential local audit remain excluded. Browser evidence contains demo identities and independent SYNTHETIC scenarios only.

## RESULT

**PASS — combined local Driver/offline acceptance.** Container/deployment acceptance is separate and remains unverified for this revision.

## REMAINING RISKS

- Clearing browser storage, losing the device or private browsing expiry can lose unsynchronized records. Browsers that block shared storage cannot establish the safe offline identity fallback. Shared-device local proof remains sensitive operational metadata; explicit logout is guarded and clears that user's completed cache.
- Clock drift beyond the documented bounds and stale server versions produce visible retained failures/conflicts. A conflicted queue needs review; automatic rebasing/discard and new resolution actions were not added.
- Binary photo/signature storage, GPS/turn-by-turn navigation and verified depot return are unavailable.
- No physical mobile keyboard/device test, current Docker run or deployment was performed. The independent judge is SYNTHETIC; it does not extend the private official calendar.

## NEXT

Final Integration / Packaging / Deployment, following user approval. No next product milestone or Datathon work started.
