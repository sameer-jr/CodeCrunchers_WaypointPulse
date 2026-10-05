# Competition review readiness

Prepared 2026-10-05, Asia/Colombo, for the user-confirmed **clean demo with fresh workflow and a completed example**. This is an additive preparation of the public SYNTHETIC judge environment. Historical verification reports remain unchanged.

Application: [Waypoint Pulse](https://web-production-87afe.up.railway.app). Four judge accounts use the intentionally public password `WaypointJudge!2026`: `dispatcher@waypoint.local`, `loader@waypoint.local`, `driver@waypoint.local`, `store@waypoint.local`.

## Reviewer entry points

| Purpose | Registered day | Records | Intended initial review state | Live verification |
| --- | --- | --- | --- | --- |
| Loader workflow | **2040-03-12** — default | **DEMO-REVIEW-AMBIENT-192**, vehicle **SYN-PLAN-DRIVER-AMBIENT** | Independently validated and released; 192 ordered; loading has not started; Driver has not departed | **PENDING** |
| Driver workflow | **2040-03-12** — default | **DEMO-REVIEW-CHILLED-25** and **DEMO-REVIEW-FROZEN-25**, vehicle **SYN-PLAN-DRIVER-REEFER** | Released, 25 + 25 loaded, ready and assigned to the judge Driver; not started, delivered or receipted | **PENDING** |
| Fresh planning | **2040-03-13** | **DEMO-PLAN-AMBIENT-100** | Confirmed 100-unit ambient demand; no generated plan for this day | **PENDING** |
| Completed media example | **2040-03-05** — history | **SYN-PLAN-DRIVER-ORDER-CHILLED**, completed Reefer trip | Retained 25 ordered / 25 loaded / 25 delivered / 25 received, actual synthetic photo/signature and explicit Store receipt | **PENDING — preservation recheck** |
| Completed shortfall example | **2040-03-05** — history | **SYN-LOADER-DRIVER-ORDER-192**, completed ambient trip | Retained 192 ordered / 188 loaded / 188 delivered / 188 received and original shortage approval/receipt history | **PENDING — preservation recheck** |

All four new orders belong to the existing judge Store's FRESH outlet. The review days have independent synthetic day availability and new-week fuel configuration. The source preparation supplies demand and references; the live release, loading and readiness above must be performed through authorized application actions and verified separately. Historical deferred demand can retain its truthful constraint explanation rather than being deleted to make planning look perfect.

The role-home guide directs each reviewer to the relevant day and action. Dispatcher can inspect the released March 12 plan, its independent validation and explanation, then use March 13 for a fresh generation. Loader can record a full 192-unit load or demonstrate a truthful shortfall with Dispatcher approval. Driver can start the already-ready cold route, record arrival and proof, synchronize, and complete its stops. Store tracks those same orders and separately confirms received quantities after delivery. The March 5 proof gallery offers an immediate completed example without changing current orders.

The public demo is shared mutable application state. Completing an order during review is persisted; refreshing or restarting the deployment does not reset it. Later reviewers can inspect the completed result and retained audit history.

## Data safety and preservation

No application functionality is removed and no live business history is deleted or reset. The original nine migrations, tenth media/location migration, historical delivery/receipt identities and normalized attachment bytes remain preserved. Public preparation refuses databases containing OFFICIAL reference data and uses independently authored SYNTHETIC references only. The raw competition CSV/ZIP, confidential prototype data, private credentials and local databases remain excluded from Git and Docker.

No photo, signature, GPS reading, delivery or receipt is fabricated for the new orders. Existing completed proof was explicitly captured in the prior synthetic acceptance journey. Map coordinates remain separately recorded, labelled synthetic examples; a real Driver location requires opt-in and a device that can provide a reading. The earlier laptop test verified the unavailable-GPS fallback, not successful GPS reception. Physical mobile camera/touch/GPS acceptance remains pending.

## Release evidence

| Check | Result |
| --- | --- |
| Fresh database preparation and repeat-startup preservation | **PENDING** |
| Current typecheck, lint, tests, build and private-data checks | **PENDING** |
| Exact published commit's Ubuntu Docker verification | **PENDING** |
| Matching Railway API/Web deployment and HTTPS/database health | **PENDING** |
| Four-role browser entry points and actual March 12 prepared states | **PENDING** |
| March 13 demand remains ungenerated | **PENDING** |
| Existing completed delivery/receipt/media identities preserved | **PENDING** |

The [media/maps report](media-maps-verification.md) retains prior verified feature evidence; it is not a substitute for this preparation's release checks. A demo video has **not been recorded** and no video URL is invented.
