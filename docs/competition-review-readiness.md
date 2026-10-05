# Historical competition review preparation

Prepared 2026-10-05, Asia/Colombo, for the earlier user-confirmed **clean demo with fresh workflow and a completed example**. This report records the additive preparation and acceptance of that superseded SYNTHETIC environment.

**Superseded historical preparation:** the user subsequently chose normal production operation, safe starter references, no seeded orders and removal of the competition-demo panel. The prior operational test records and example IDs below were cleared on October 5 after a verified private backup and restoration check. These are historical preparation facts and screenshots, not current reviewer entry points or reset instructions. Completed cleanup, the normal starter release and current release evidence are documented in [production starter readiness](production-starter-readiness.md). The intervening four-confirmed-order proposal was also superseded before live cleanup acceptance.

Application: [Waypoint Pulse](https://web-production-87afe.up.railway.app). Four judge accounts use the intentionally public password `WaypointJudge!2026`: `dispatcher@waypoint.local`, `loader@waypoint.local`, `driver@waypoint.local`, `store@waypoint.local`.

## Historical reviewer entry points

| Purpose | Registered day | Records | Prepared state at acceptance | Historical verification |
| --- | --- | --- | --- | --- |
| Loader workflow | **2040-03-12** — default | **DEMO-REVIEW-AMBIENT-192**, vehicle **SYN-PLAN-DRIVER-AMBIENT** | Independently validated and released; 192 ordered / 0 loaded; Driver assigned and not departed | **PASS — preparation and Loader browser** |
| Driver workflow | **2040-03-12** — default | **DEMO-REVIEW-CHILLED-25** and **DEMO-REVIEW-FROZEN-25**, vehicle **SYN-PLAN-DRIVER-REEFER** | 25 + 25 loaded, READY_FOR_DISPATCH and assigned to the judge Driver; not started, delivered or receipted | **PASS — prepared state and Driver browser; Start Trip enabled** |
| Fresh planning | **2040-03-13** | **DEMO-PLAN-AMBIENT-100** | Confirmed 100-unit ambient demand; no generated plan; Generate enabled | **PASS — records and Dispatcher browser** |
| Completed media example | **2040-03-05** — history | **SYN-PLAN-DRIVER-ORDER-CHILLED**, completed Reefer trip | Retained 25 ordered / 25 loaded / 25 delivered / 25 received, actual synthetic photo/signature and explicit Store receipt | **PASS — identities/hashes preserved; actual proof and receipt rendered for Driver/Store** |
| Completed shortfall example | **2040-03-05** — history | **SYN-LOADER-DRIVER-ORDER-192**, completed ambient trip | Retained 192 ordered / 188 loaded / 188 delivered / 188 received and original shortage approval/receipt history | **PASS — order version 13 and completed trip version 20 preserved** |

All four new orders belong to the existing judge Store's FRESH outlet. The review days have independent synthetic day availability and new-week fuel configuration. Source preparation supplies demand and references; authorized application actions independently generated, validated and released the March 12 plan. Its three new execution orders were served in two trips; four historical constraints remained truthfully deferred. Cold loading/readiness was recorded through the normal workflow. Historical demand was not deleted to make planning look perfect.

| Verified historical object | Identity | State at preparation |
| --- | --- | --- |
| March 12 execution plan | `bfdd48ef-3120-4756-ad71-b5826a83b99f` | Independently validated, RELEASED; three new served orders / four historical deferred orders / two trips |
| Ambient review trip | `db14797a-dfbe-43a5-aa2d-55abe0477a20` | RELEASED; 192 ordered / 0 loaded; Driver assigned; not departed |
| Cold review trip | `31d6df85-0d42-4d9f-abab-ccfb7641c026` | READY_FOR_DISPATCH; two stops / 50 loaded; Driver assigned; not departed |
| March 13 planning order | `4758c969-4334-4cae-84ff-8807a3c37a6e` | CONFIRMED; 100 units; no March 13 plan |

At that acceptance snapshot, the role-home guide directed each reviewer to the relevant day and action. Dispatcher could inspect the released March 12 plan and use March 13 for a fresh generation; Loader could record the 192-unit load; Driver could start the ready cold route; Store could track the same orders and separately confirm receipt. The March 5 gallery provided a completed example. Those guides and operational examples are no longer supplied by the current starter release.

That prepared public environment was shared mutable application state. Reviewer actions persisted across refresh and restart. Its later authorized operator cleanup was a separate maintenance operation; normal startup still does not reset user actions.

## Data safety and preservation

The preparation itself removed no functionality or operational history. At that snapshot, all ten migrations and the earlier delivery/receipt identities and normalized attachment bytes remained preserved. The later separately authorized cleanup removed those test records after backup/restore verification; migrations and application features remain intact. Public preparation refused OFFICIAL reference data and used independently authored SYNTHETIC references only. Raw competition CSV/ZIP, confidential prototype data, private credentials and local databases remain excluded from Git and Docker.

No photo, signature, GPS reading, delivery or receipt is fabricated for the new orders. Existing completed proof was explicitly captured in the prior synthetic acceptance journey. Map coordinates remain separately recorded, labelled synthetic examples; a real Driver location requires opt-in and a device that can provide a reading. The earlier laptop test verified the unavailable-GPS fallback, not successful GPS reception. Physical mobile camera/touch/GPS acceptance remains pending.

## Release evidence

Preparation source was published as commit `9cf3d129f3caae3eb7bb9d55fa0228b99728abed`. Both Railway services and the successful Ubuntu Docker run matched that historical source. The following checks verified preparation and all four role entry points without consuming the untouched execution examples; they do not identify the current deployed commit.

| Check | Result |
| --- | --- |
| Isolated database preparation and repeat-startup preservation | **PASS — 14 focused public-judge database checks; full suite uses real isolated PostgreSQL** |
| Preparation typecheck, lint, tests, build and private-data checks | **PASS — 357/357 tests across 15 files**, plus typecheck, lint, build and safety checks |
| Publication index and reachable-history private-data audit | **PASS — 333 index paths / 332 blobs and 333 history paths / 438 blobs; zero private matches** |
| Exact published commit's Ubuntu Docker verification | **PASS — [run 37296909199](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/runs/37296909199)** on `9cf3d129`; always-run container/volume cleanup passed |
| Matching Railway API/Web deployment and HTTPS/database health | **PASS — API and Web SUCCESS on `9cf3d129`; Web/API health HTTP 200 with database connected** |
| Four-role HTTPS authentication/resource smoke | **PASS — 43 requests across the four judge roles** |
| Actual March 12 plan/release/loading preparation | **PASS — three new served orders, two trips, ambient 192 awaits loading, cold 50 ready and neither departed** |
| Four-role browser entry points | **PASS — Dispatcher default/guide and fresh Generate, both Loader manifests, ready Driver route, Store guide/create/tracking/receipt and actual completed proof** |
| March 13 demand remains ungenerated | **PASS — 100-unit CONFIRMED order; no plan, Generate enabled** |
| Existing completed delivery/receipt/media identities preserved | **PASS — 26-request media reconciliation retained identities/hashes and 25-unit receipt; original 192/188 order/trip versions preserved** |

Railway deployments: API `95b1d0cf-7766-4599-94d3-f87da40d48d9`, Web `61fb34d5-03fa-4658-b75e-2877e9bb8b5a`. The live smoke and read-only reconciliation are distinct from preparation mutations; the completed examples were not replayed or reset.

## Browser acceptance and review evidence

Dispatcher login opened March 12 and its role guide. March 13 Planning Studio had no plan and an enabled Generate action. Loader showed the two March 12 manifests: the untouched 192-unit ambient load and the ready 50-unit cold route. Driver defaulted to the assigned cold trip with **50 ordered / 50 loaded / 0 delivered**, no departure and **Start Trip** enabled. Its completed-example link opened the retained CHILLED stop `c289758d-ed24-4d93-88c8-3336f44281a5`; both actual proof images decoded at 1000 pixels wide.

Store's three guide links opened the expected views. Create Order selected March 13 without submitting another order. Historical tracking rendered the completed **25 / 25 / 25 / 25** receipt packet and actual photo/signature. Current Delivery filtered March 12 to exactly the three new orders: two READY_FOR_DISPATCH and the ambient READY_FOR_LOADING order. The current role-browsing console error log was empty. Driver at 390 × 844 showed no horizontal overflow (375-pixel document width); the temporary viewport override was reset.

These historical acceptance reads did not start the route, load the 192-unit example or write another delivery/receipt. The prepared operational state was subsequently cleared by the separately authorized October 5 maintenance; it is no longer available for reviewers. Current user actions persist, with **no automatic reset** on page refresh, startup or deployment. This report and the screenshots retain the prior acceptance evidence.

Historical publication-safe screenshots: [Dispatcher guide](screenshots/competition-review-dispatcher.png), [fresh planning](screenshots/competition-review-planning.png), [Loader manifests](screenshots/competition-review-loader.png), [ready Driver route](screenshots/competition-review-driver.png), [Driver mobile view](screenshots/competition-review-driver-mobile.png), [completed proof](screenshots/competition-review-completed-proof.png), [Store guide](screenshots/competition-review-store.png), [completed Store receipt](screenshots/competition-review-store-receipt.png). Visible records and proof are independently authored synthetic examples of the removed prepared state.

The [media/maps report](media-maps-verification.md) retains prior verified feature evidence; it is not a substitute for this preparation's release checks. A demo video has **not been recorded** and no video URL is invented.
