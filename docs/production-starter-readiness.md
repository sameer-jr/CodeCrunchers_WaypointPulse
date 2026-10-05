# Production starter readiness

Prepared 2026-10-05, Asia/Colombo, for the user's definitive instruction: **remove the competition-demo panel, use normal production dates and flows, keep safe starter records, and let users create all orders**. The earlier retained-history/prepared-route and four-confirmed-order proposals are superseded historical context.

Application: [Waypoint Pulse](https://web-production-87afe.up.railway.app). **Private backup/reset, matching deployment and live starter-state acceptance are PENDING.** This document does not claim that testing history has already been removed.

## Requested starting state

Normal configuration is `NODE_ENV=production`, `PUBLIC_JUDGE_DEMO=false`, `STARTER_REFERENCE_DATA=true`, and the exact HTTPS `WEB_ORIGIN`. The application uses the current **Asia/Colombo** clock and its ordinary calendar/availability/cutoff rules. There is no competition-demo panel, special review guide or fixed future demonstration date.

The four role accounts keep the intentionally public password `WaypointJudge!2026`: `dispatcher@waypoint.local`, `loader@waypoint.local`, `driver@waypoint.local`, `store@waypoint.local`. They have their normal role and safe outlet/depot scope. Starter references are independently authored and publication-safe; no confidential competition data is required.

| Inventory | Requested state | Live verification |
| --- | --- | --- |
| Accounts and role scope | Four role accounts with usable assigned outlet/depot access | **PENDING** |
| Safe reference records | Independently authored outlets/depot/fleet/calendar/availability/travel/service/opening-fuel facts for normal current-date operation | **PENDING** |
| Orders | **Zero**; Store users create every order through Place Order | **PENDING** |
| Plans, trips/stops and loading | **Zero**; Dispatcher/Loader perform the normal workflow after demand exists | **PENDING** |
| Deliveries, proof attachments and receipts | **Zero**; users capture real evidence and confirm receipt after delivery | **PENDING** |
| Exceptions, deferrals, offline operations and location records | **Zero prior test records** | **PENDING** |
| Historical operational/audit/fuel-usage records | **Zero prior test history**; safe opening reference facts remain | **PENDING** |

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

The actual private backup/restore/reset has **not yet run**. Dumps, credentials, verification copies and reset artifacts remain private and excluded from Git, Docker and public screenshots. Original migrations and product features remain intact. Historical reports retain factual earlier acceptance evidence; they do not describe the requested live starting inventory.

After maintenance, user actions persist across refresh/restart/deployment. **There is no automatic reset.** Recording should use a separate fresh safe installation so users can start the public system themselves.

## Verification evidence

| Check | Result |
| --- | --- |
| Normal-starter source and guarded zero-order reset checks | **PENDING** |
| Current typecheck, lint, real PostgreSQL suite, build and privacy checks | **PENDING** |
| Private production backup and restore verification | **PENDING — not performed** |
| Actual operator cleanup and safe reference-only startup | **PENDING — not performed** |
| Zero orders/old operational history and correct account/reference scope | **PENDING** |
| Exact published commit's Ubuntu Docker run and cleanup | **PENDING** |
| Matching Railway API/Web deployment and database-connected HTTPS health | **PENDING** |
| Four-role live normal-navigation/current-date/starter-state acceptance | **PENDING** |

Earlier source/browser results remain in [previous review readiness](competition-review-readiness.md), [media/maps verification](media-maps-verification.md) and milestone reports. They do not establish current cleanup/acceptance. Physical phone camera/finger signature/GPS/keyboard acceptance remains pending. The demo video has **not been recorded**; the README `NULL` placeholder remains until an actual public link exists.
