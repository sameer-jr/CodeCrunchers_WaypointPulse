# Production starter readiness

Prepared 2026-10-05, Asia/Colombo, for the user's definitive instruction: **remove the competition-demo panel, use normal production dates and flows, keep safe starter records, and let users create all orders**. The earlier retained-history/prepared-route and four-confirmed-order proposals are superseded historical context.

Application: [Waypoint Pulse](https://web-production-87afe.up.railway.app). **Source/container checks, both initial deployments, private backup/restore, guarded reset, four-role HTTPS smoke and all four role browser checks PASS.** The verified HTTP snapshot is **2026-10-05T15:42:01Z / 21:12:01 Asia/Colombo**. Temporary restore/remote helper copies are cleaned up; the private local backup is retained.

## Verified starting inventory

Normal configuration is `NODE_ENV=production`, `PUBLIC_JUDGE_DEMO=false`, `STARTER_REFERENCE_DATA=true`, and the exact HTTPS `WEB_ORIGIN`. The application uses the current **Asia/Colombo** clock and its ordinary calendar/availability/cutoff rules. There is no competition-demo panel, special review guide or fixed future demonstration date.

The four role accounts keep the intentionally public password `WaypointJudge!2026`: `dispatcher@waypoint.local`, `loader@waypoint.local`, `driver@waypoint.local`, `store@waypoint.local`. They have their normal role and safe outlet/depot scope. Starter references are independently authored and publication-safe; no confidential competition data is required.

| Inventory | Starting snapshot | Live verification |
| --- | --- | --- |
| Accounts and role scope | Four role accounts with assigned outlet/depot access | **PASS — four scoped HTTPS logins and unchanged retained account/mapping counts/checksums** |
| Safe reference records | Independently authored outlet/depot/fleet/calendar/availability/travel/service/opening-fuel facts for current-date operation | **PASS — all 12 retained table counts/checksums identical before/after reset** |
| Orders | **Zero**; Store users create every order through Place Order | **PASS — reset and read-only HTTPS verification** |
| Plans, trips/stops and loading | **Zero**; Dispatcher/Loader perform the workflow after demand exists | **PASS — reset and scoped empty-workspace HTTP verification** |
| Deliveries, proof attachments and receipts | **Zero**; users capture evidence and receipt after delivery | **PASS — guarded reset inventory** |
| Exceptions, deferrals, offline operations and location records | **Zero prior test records** | **PASS — guarded reset inventory** |
| Historical operational/audit/fuel-usage records | **Zero prior test history**; safe opening reference facts remain | **PASS — guarded reset inventory** |

No seeded order, completed example, generated plan, ready route, image, signature, receipt, location or special demonstration object ID is supplied.

## Ordinary role journey

1. **Store Manager:** open Place Order, choose the assigned outlet, enter actual demand and submit. Observe its confirmed state and eligible date under normal calendar/cutoff validation.
2. **Dispatcher:** select that eligible date, Generate, inspect Explain My Plan, independently Validate, Release and assign Driver.
3. **Loader:** record actual quantities for the released trip. A shortage requires the normal Dispatcher review before Mark Ready for Dispatch.
4. **Driver:** start the assigned ready trip, record arrival/outcome/quantity/recipient and optional photo/signature, synchronize queued operations, then Finish Trip after terminal stops.
5. **Store Manager:** track that same delivery and explicitly record what was received. Delivery never creates receipt automatically.

Initially each operational workspace correctly has no work. Users create demand before planning; a released plan is required before loading, and readiness/assignment before Driver departure. Map coordinates require an explicit scoped recording; optional GPS requires an active trip, opt-in, permission and a working provider. No coordinates or received position are invented.

## Guarded maintenance and privacy

Removing prior production testing history is a separate guarded operator maintenance operation, requiring a private database backup, successful restoration into a verification copy and confirmation that the target is the intended publication-safe starter database. The operation must refuse OFFICIAL/private dataset provenance. It clears its explicit operational-table set and leaves safe accounts/reference records with **zero orders**. It is not exposed as an HTTP reset endpoint and is never part of normal startup.

The **445,989-byte private backup** was genuinely restored into an isolated PostgreSQL 18 verification database. All **30 table digests matched**, including attachment/media bytes; the primary database remained unchanged during restore verification. Backup hash and restored inventory checks passed before maintenance.

The separately guarded `--empty-orders` reset then **PASSed**: all **18 operational tables returned zero rows** and all **12 retained reference/account table counts and checksums were identical** before/after. The earlier 18 orders, two plans and seven trips were removed. This is the transaction-completion inventory; subsequent logins create normal sessions and subsequent user actions persist. Dumps, credentials, verification copies and reset artifacts stay private and excluded from Git, Docker and public screenshots. Original migrations/features and factual historical acceptance reports remain intact.

After maintenance, user actions persist across refresh/restart/deployment. **There is no automatic reset.** Recording should use a separate fresh safe installation so users can start the public system themselves.

## Verification evidence

Published functional starter source: `c2b19ca17c736ba780586aeaa7802facfde70f26`. Its 365-test suite, exact Docker run and byte-exact initial CLI deployment are verified below. Two subsequent login wording changes (**Starter accounts** and configured-password guidance) passed typecheck, lint, Web build and safety checks. Those source checks are separate from the accepted `c2b19ca` deployment snapshot.

| Check | Result |
| --- | --- |
| Normal-starter source and guarded zero-order reset checks | **PASS — 22 focused checks using real isolated PostgreSQL** |
| Current typecheck, lint, real PostgreSQL suite, build and privacy checks | **PASS — 365/365 tests across 15 files**, plus typecheck, lint, build and publication-safety checks |
| Private production backup and restore verification | **PASS — 445,989-byte archive, genuine isolated PostgreSQL 18 restore, all 30 table digests/media matched; primary unchanged during verification** |
| Actual operator cleanup and safe reference-only startup | **PASS — guarded `--empty-orders`; all 18 operational tables zero at reset completion** |
| Zero orders/old operational history and correct account/reference scope | **PASS — all 12 retained counts/checksums identical; scoped live reads empty** |
| Exact published commit's Ubuntu Docker run and cleanup | **PASS — [run 37330960034](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/runs/37330960034)** on `c2b19ca`; always-run container/volume cleanup succeeded |
| Railway release source identity | **PASS — CLI upload of 344 public files matched `c2b19ca` byte-for-byte; Railway commit metadata is `null`** |
| Railway API/Web completion and database-connected HTTPS health | **PASS — both CLI deployments SUCCESS; public HTTPS `/api/health` returned 200 with database connected at 15:38:46 UTC** |
| Four-role live HTTPS authentication/resource/empty-state smoke | **PASS — 37 requests; scoped accounts, Secure/HttpOnly/SameSite=Strict cookies, no demo metadata, current Sri Lanka date, zero orders/plans/manifests/routes and old test objects 404** |
| Store live browser/Place Order acceptance | **PASS — all home counts zero / No orders yet, 45 operating dates and normal cutoff context; no order submitted** |
| Dispatcher live browser acceptance | **PASS — October 5 Pulse counts zero; Planning has no generated run and generation is disabled until demand exists** |
| Loader live browser acceptance | **PASS — October 5 counts zero and no released loads** |
| Driver live browser acceptance | **PASS — October 5 Connected server data and no ready routes/history** |
| Post-browser logout and inventory reconciliation | **PASS — all test sessions logged out; all 18 operational tables still zero and all 12 retained counts/checksums unchanged** |
| Temporary restore/remote helper/archive cleanup | **PASS — isolated restore and remote working copies removed after rechecking the 445,989-byte archive; private local backup retained** |
| Temporary maintenance SSH access cleanup | **PASS — temporary key revoked and its local key files removed at 16:01:19 UTC / 21:31:19 Asia/Colombo; registered-key inventory returned to its original empty state** |
| Final login wording validation | **PASS — two copy-only strings; typecheck, lint, Web build and safety** |

## Verified Railway release and maintenance

Railway's official [GitHub-triggered build incident](https://status.railway.com/incident/8RELVRFI) was reported October 5 at 14:55 UTC (20:25 Asia/Colombo). GitHub-origin builds queued, so the release used a CLI upload of the verified public source artifact. The upload excludes private data/configuration. Both services subsequently passed deployment completion and HTTPS health; those results do not perform database cleanup.

| Service | CLI deployment | Source identity | Acceptance status |
| --- | --- | --- | --- |
| API | `008b93f4-8446-433e-82ad-4282ac6bd627` | Byte-exact public files from `c2b19ca`; CLI commit metadata `null` | **SUCCESS — verified October 5 15:38:46 UTC** |
| Web | `78837d91-8bdc-4743-a708-2262ff53a874` | Same verified public source artifact; CLI commit metadata `null` | **SUCCESS — verified October 5 15:38:46 UTC** |

Public HTTPS `/api/health` returned HTTP 200 with database connected at **October 5 15:38:46 UTC / 21:08:46 Asia/Colombo**. Commit `c2b19ca` identifies the verified source artifact and exact GitHub Docker run; it is not Railway-provided CLI commit metadata. Private restore verification completed at **15:40:59 UTC / 21:10:59 Asia/Colombo**, followed by the guarded reset and live HTTP smoke at **15:42:01 UTC / 21:12:01 Asia/Colombo**. Subsequent four-role browser/logout checks passed and a final guarded inventory matched the reset result. These are recorded starting snapshots; user actions created later persist.

### Retained inventory after reset

The private guarded inventory verified the following counts and confirmed each retained table's checksum was identical before and after the reset. Old operational history was removed; these safe account/reference facts remain.

| Model | Retained rows |
| --- | --- |
| User | 4 |
| ReferenceImport | 0 |
| Depot | 2 |
| Outlet | 5 |
| Vehicle | 7 |
| CalendarDay | 100 |
| DistrictTravel | 2 |
| ServiceAllowance | 3 |
| UserOutlet | 1 |
| UserDepot | 2 |
| VehicleAvailability | 192 |
| FuelLedger | 35 |

All 18 operational tables were zero at reset completion. The live 37-request read-only smoke at **2026-10-05T15:42:01Z** confirmed zero scoped orders/plans/load manifests/Driver history, no demo metadata, current-date context and 404 for removed old test objects. All smoke HTTP sessions were logged out; no business records were created.

### Four-role browser acceptance

Store showed ordinary navigation, all home counts zero and **No orders yet**. Place Order offered **45 dates, October 6–November 19**, with **October 7** next eligible after the 16:00 Asia/Colombo cutoff on October 5. Dispatcher Pulse selected October 5 with all counts zero; Planning had no generated run and correctly disabled generation until demand exists. Loader selected October 5 with zero counts/no released loads. Driver selected October 5, **Connected server data**, no ready routes and no old history. All roles lacked the competition-demo panel and prior fixed-date operational history. These are observed normal-clock/empty-state facts, not prepared workflow results.

All test sessions were logged out, no business records were created, and a final private inventory confirmed the same zero operational rows and identical retained counts/checksums. Screenshots: [empty Store home](screenshots/production-starter-store.jpg), [ordinary Place Order](screenshots/production-starter-place-order.jpg), [empty Planning Studio](screenshots/production-starter-planning.jpg), [empty Loader workspace](screenshots/production-starter-loader.jpg), [empty connected Driver workspace](screenshots/production-starter-driver.jpg).

The private restore clone and remote helper/archive working copies were removed after rechecking the backup archive; the private local backup remains available. Temporary maintenance SSH access was revoked and its local key files removed at **16:01:19 UTC / 21:31:19 Asia/Colombo**, restoring the original empty registered-key inventory. This report records the accepted `c2b19ca` starting snapshot and its subsequent read-only browser checks.

Earlier source/browser results remain in [previous review readiness](competition-review-readiness.md), [media/maps verification](media-maps-verification.md) and milestone reports. Current cleanup is established by its own private restore/reset/live evidence above. Physical phone camera/finger signature/GPS/keyboard acceptance remains pending. The demo video has **not been recorded**; the README `NULL` placeholder remains until an actual public link exists.
