# Delivery media and maps verification

Prepared 2026-10-05, Asia/Colombo, for the user-authorized photo/signature/maps follow-up. This report describes the implemented feature behavior and its **historical acceptance source, tests, synthetic workflow and screenshots**. The production operational test records documented below were cleared later that day after verified private backup/restoration; their IDs and proof galleries are not preloaded examples in the current live system. Features and migrations remain intact. See [production starter readiness](production-starter-readiness.md) for the normal starter configuration and current release evidence.

## Implemented behavior

Driver Proof includes Take photo, JPEG/PNG upload, photo previews/removal and a recipient signature pad supporting finger, pen or mouse. Use signature attaches the drawing; Clear signature removes it. Preparation and uncommitted signature strokes block delivery submission. Photos/signatures are optional and supplement the existing recipient, outcome, delivered quantity, reason, note and completion time. They never confirm a Store receipt or change the ordered/loaded quantities.

| Limit | Implemented behavior |
| --- | --- |
| Photos | Up to three, each at most 1 MiB after preparation; server output JPEG within 1600 × 1600 |
| Signature | Up to one, at most 256 KiB; server output PNG within 1600 × 800 |
| Browser source | Readable JPEG/PNG, non-empty and at most 20 MiB; decoded source at most 64 megapixels, resized before submission. HEIC/SVG/other formats are rejected. |
| API source | Canonical bounded base64; matching declared MIME and file signature; decodable single-page image; dimensions at most 4096 per side and 16,777,216 input pixels |
| Transport | 5 MiB authenticated Driver completion/sync JSON and Nginx body limit; normal JSON endpoints remain 16 KiB |
| Storage | Private PostgreSQL attachment BYTEA, SHA-256, dimensions, byte length and proof link; immutable SQL evidence guards |

Server image processing re-encodes and normalizes attachment bytes before the atomic delivery transaction. Normalized attachment bytes exclude input metadata. OfflineOperation also retains its original bounded sync payload privately for idempotence/history; the normal browser prepares/re-encodes images before building that payload. Database backups/storage planning must include both attachment rows and sync history. There is no external image-host credential, public file URL or filesystem upload directory.

Driver, Store and Dispatcher galleries fetch actual image bytes through the authenticated application API, with `private, no-store` responses and fixed image MIME/`nosniff`. Gallery addresses are restricted to same-origin attachment UUID paths. Object URLs are revoked on identity change/unmount; failed image reads remain visible with Retry. Loader, foreign outlet/depot accounts and unassigned Drivers cannot obtain attachment bytes. Older proof with only legacy metadata explicitly reports unavailable image content; absence of a photo/signature is shown as not captured.

## Offline evidence

Complete Delivery saves the bounded attachment payload and operation UUID into that Driver's IndexedDB queue before projecting a local delivery. Pending previews read that same payload. Reload/retry preserves attachment bytes and the operation UUID; the acknowledged server result provides attachment identities and metadata. Local pending media is labelled device-saved and unshared until successful synchronization. Failed delivery attempts can include photo evidence without inventing a recipient or delivered goods.

A failed initial device write keeps the form available and reports that the action was not saved on the device. Failure to persist synchronization status reports retained prior work and permits an idempotent retry. Conflicts retain their payload and block dependent operations; no automatic conflict resolution is added. Browser storage can be cleared, evicted or exhausted, and lost devices can lose unsynced work. Keep the device/session available until the server acknowledges. Authorized server images are deliberately excluded from the service-worker cache, so previously synced images need a connection to fetch; pending local attachment previews are the offline evidence path.

## Maps and position behavior

Dispatcher can record or revise outlet latitude/longitude with an explanation and expected location version. Those edits are audited and separate from immutable imported source references. Latitude is bounded to −90…90 and longitude to −180…180. Neither the auth/safe judge seed nor the importer supplies invented coordinates. A route without recorded locations keeps its usable stop list and explains that no coordinates are available.

| Role | Permitted map/position behavior |
| --- | --- |
| Dispatcher | Read scoped trip stops/position and edit scoped outlet coordinates |
| Driver | Read its assigned trip and optionally report its position during the departed, incomplete IN_TRANSIT trip |
| Store Manager | Read the vehicle position for its eligible delivery trip, and only its own stop/outlet coordinates |
| Loader | Location and delivery attachment access denied |

Share location is an explicit Driver opt-in requiring browser permission and HTTPS or localhost. Updates send at most once per ten seconds while the app is connected and visible, pause offline/hidden, and stop on leaving the workspace. Reload requires a new opt-in. Permission denial or GPS failure does not block delivery. TripPosition retains the latest reported location, accuracy, client event and server receipt time; it is not a background movement-history service.

The API rejects invalid coordinates/accuracy, more-than-two-minute-old readings, readings over 30 seconds ahead, readings before actual departure and timestamps no newer than the last accepted report. Accuracy must be 0…10,000 metres. Map reads poll every 15 seconds online. Positions older than two minutes, positions viewed offline and completed-trip positions are labelled historical; the map is a reported position view rather than a promise of continuous live tracking.

Show route map lazy-loads Leaflet. Markers and dashed segments use recorded stop coordinates/sequence; no road routing, turn-by-turn guidance, reverse geocoding or position-derived ETA is calculated. The accuracy circle represents the browser's reported uncertainty.

Map tiles come from the external OpenStreetMap service after the user opens the map, with visible attribution, browser caching and an origin-only cross-origin referrer. It can receive the user's IP, browser information and requested viewed area. Its [tile policy](https://operations.osmfoundation.org/policies/tiles/) permits ordinary interactive viewing and forbids bulk/offline prefetch; availability has no guarantee. The application provides no tile download/precache feature. Offline mode and tile failures leave delivery/proof and recorded coordinate/stop details usable. A different tile provider requires an implementation/CSP change and its own terms review.

## Endpoint and migration inventory

| Method | Endpoint | Boundary |
| --- | --- | --- |
| POST | `/api/driver/stops/:id/complete` | Existing delivery action now accepts bounded optional attachments |
| POST | `/api/driver/sync` | Existing UUID sync action now preserves bounded attachment payloads |
| GET | `/api/proof/attachments/:id` | Current actor, role and related delivery object scope before binary read |
| GET | `/api/location/trips/:id` | Scoped trip locations/latest position; Store stop list restricted to its outlet |
| PUT | `/api/location/outlets/:id` | Dispatcher-only, expected version and audited reason |
| POST | `/api/location/trips/:id/position` | Assigned active Driver, fresh ordered position reading |

Migration `20261004000900_delivery_media_location` adds DeliveryAttachment, OutletLocation and TripPosition, plus outlet-location audit enum values. There are **ten additive migrations and 30 Prisma models**. The prior nine migration files remain unchanged. Default fresh Compose installation is auth-only: the generic Docker installation checker verifies all non-auth models are empty, including these new tables. The later explicit `STARTER_REFERENCE_DATA=true` mode additionally supplies safe references and role scope, with no operational orders/history; see the current starter report. No competition CSV/ZIP/prototype data, personal delivery photos/signatures, private coordinates, credentials or local databases are placed in repository/build files.

## Historical feature verification status

| Evidence | Status |
| --- | --- |
| Pre-change accepted baseline | 308/308 tests passed before feature edits; historical baseline only |
| Focused media/Driver API checks | PASS — 44/44 across two files, using isolated PostgreSQL and ten migrations |
| Focused location database checks | PASS — 18/18 with isolated PostgreSQL |
| Focused offline/media projection checks | PASS — 22/22, including reload payloads, scoped previews, retry UUID/bytes, failed-attempt evidence, size/count bounds and URL restrictions |
| Final integrated typecheck/lint/test/build/safety gate | **PASS — 351/351 tests across 15 files**, plus typecheck, lint, build and publication-safety checks |
| Authenticated desktop and 360/390 px browser acceptance | **PASS — mouse signature, real image galleries, centered preview and no horizontal overflow observed**; physical touch remains separate |
| Actual offline media save/reload/reconnect browser journey | **PASS — local and production pending media survived offline reload, then became scoped server proof after synchronization** |
| Exact published commit and Linux Docker CI | **PASS — commit `3f204e45559fd9a72e19586dbe9809afb73743a2`, [run 37266088689](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/runs/37266088689)** |
| Railway API/Web commit and migration/health | **PASS — both services deployed `3f204e4`, ten migrations applied and database-connected HTTPS health passed** |
| Four-role production photo/signature/map smoke | **PASS — 43-request authentication/resource smoke plus actual four-role synthetic workflow and separate receipt reconciliation** |
| Real Driver GPS reading | **UNVERIFIED — user approved the real-location test, but this laptop's provider returned unavailable; no position was stored** |
| Physical mobile camera/signature/GPS/keyboard acceptance | **PENDING — browser simulation or source checks do not establish physical-device behavior** |

## Feature acceptance checklist

1. Use a separate publication-safe synthetic scenario, not the live starter database. Preserve migration history and any user-created work. The completed live examples used by this historical acceptance are no longer preloaded.
2. Follow the existing planning/release/loading/assignment flow. Keep original ordered and actual loaded units separate while executing Driver delivery.
3. Upload a safe JPEG/PNG, inspect its preview, remove/re-add it; reject an unsupported file and a fourth photo. Draw a signature; verify unfinished ink blocks completion, Clear removes it and Use signature attaches it. Check touch targets/overflow at 360 and 390 px.
4. Save one delivery with photo/signature while actually offline. Observe pending labels, reload offline, inspect retained local previews, reconnect and observe successful ordered synchronization. Repeat sync/refresh and confirm identical attachment/delivery IDs without duplicates.
5. Read the same actual photo/signature as Driver, its Store and permitted Dispatcher. Confirm image MIME/cache headers and foreign/Loader denial. Ensure the Store has not been automatically receipted; explicitly confirm receipt and reconcile all four quantities separately.
6. Verify truthful missing-coordinate output. Explicitly record approved safe demo coordinates with an explanation, inspect stop markers/sequence lines, and check Store sees only its own stop. Opening a map must not imply road directions or a GPS ETA.
7. Explicitly opt in to GPS for an active trip; distinguish a controlled browser location test from a physical device reading. Verify a received location/accuracy, Stop sharing, permission denial and historical labels. Check hidden/offline/reload behavior and retain usable delivery when tiles cannot load.
8. Publish only after source checks and private-data audit. Record the tested commit's real Docker run, matching deployments, ten migrations and actual HTTPS media/offline/location smoke before marking that feature release acceptance PASS. Checking historical record preservation was part of the acceptance below, before the later authorized test-history cleanup.

## Remaining limits

No offline map tiles, continuous background tracking, route-history log, turn-by-turn routing, location-derived ETA, automatic conflict recovery, depot actual-return event or scanner/reefer telemetry is added. Signatures are captured drawings linked to the delivery, without a certificate-based signing workflow. Attachments remain optional; no photo or signature is invented for old or new deliveries. The demo video is not recorded yet.

## Local browser evidence (2026-10-05)

The fixture contains synthetic demand/reference data only; Dispatcher generated, independently validated and released it through the app. Loader recorded four full loads totaling 267 units and marked readiness. Driver started the assigned route and completed the 192-unit first delivery offline with a synthetic JPEG and a drawn synthetic signature. Empty-signature validation was observed. Both pending images survived offline reload (1000 × 700 photo, 1000 × 360 signature). Reconnection produced authorized server images for Driver, Store and Dispatcher; repeated read/refresh retained one delivery and two attachments. The normalized photo was 187,498 bytes; signature 14,938 bytes. Store receipt stayed absent until its own explicit 192-unit confirmation.

Dispatcher saved one explicitly labelled SYNTHETIC coordinate, placing three same-outlet stops on the map. The fourth stop remained unlocated. Actual OpenStreetMap tiles loaded at 256 pixels with attribution; Store received only its own three stops. No real outlet coordinates or physical GPS were used.

Browser location emulation/permission commands were unsupported. The initial local Share location action was blocked by automatic approval review because real device coordinates could be transmitted. GPS API freshness, scope and race checks passed; the later explicitly authorized production test is recorded below. No Driver position was sent by this local browser journey. A received real GPS report, permission-denial behavior, foreground pause/resume and physical mobile camera/touch remain unverified.

Screenshots: [route map](screenshots/media-maps-route.png), [offline signature](screenshots/media-offline-signature.png), [mobile signature](screenshots/media-mobile-signature.png), [Store proof](screenshots/media-store-proof.png), [Dispatcher proof](screenshots/media-dispatcher-proof.png). All pictured operational data and proof are synthetic.

The Docker verification script runs an actual in-memory synthetic PNG through the compiled photo/signature normalizer, checking output JPEG/PNG decoding, dimensions and byte lengths without writing operational rows. This probe and Web/database/authentication HTTP checks passed against the isolated Windows localhost stack. Linux container acceptance is recorded separately below.

## Historical published container and Railway evidence (2026-10-05)

The application source tested locally is commit `05ab09575dd74f33692219b98ebaae99b7d3cb49`. The published merge commit `3f204e45559fd9a72e19586dbe9809afb73743a2` preserves the upstream README and adds disclosure documentation; application source is unchanged from the tested commit.

[GitHub Actions run 37266088689](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/runs/37266088689) completed successfully on that exact published commit using `ubuntu-latest`. It built and started the root Compose stack, verified container health, Web HTTP, database-backed API health, safe seeded Dispatcher authentication, session restoration, protected access and logout. It confirmed all ten committed migrations and four safe auth accounts, with no reference or operational data seeded. The native Sharp/libvips probe decoded and normalized synthetic photo/signature bytes successfully inside the Linux API container. The always-run `docker compose down -v` cleanup step also succeeded.

| Railway service | Deployment | Commit | Result |
| --- | --- | --- | --- |
| API | `af4965bb-3d7a-4c2a-b05d-4a7f8cae7ecd` | `3f204e45559fd9a72e19586dbe9809afb73743a2` | SUCCESS; ten migrations, including the additive media/location migration |
| Web | `23845a8c-d42b-426f-af08-60447653b9d2` | `3f204e45559fd9a72e19586dbe9809afb73743a2` | SUCCESS; public HTTPS and proxied database-connected health |

Public application: [Waypoint Pulse](https://web-production-87afe.up.railway.app). Web remains the only public service; API and managed PostgreSQL use Railway private networking.

The 43-request HTTPS smoke passed all four seeded account logins, Secure/HttpOnly/SameSite=Strict `/api` cookies, restored identity, correct workspace access, wrong-role denial, logout revocation and origin protection. All four role SPA paths returned the app shell. The service worker and ten application-shell resources responded, with authenticated API and cross-origin resources excluded from precaching. These HTTP checks are separate from the browser journey below.

## Historical production browser and reconciliation evidence (2026-10-05)

A separate existing SYNTHETIC Reefer trip (`76ca6012-0f16-4ad1-8e89-4ece823b9b9e`) was assigned, fully loaded by Loader and executed by Driver: two stops of 25 units each, 50 ordered / 50 loaded / 50 delivered, both stops completed. Dispatcher explicitly recorded a labelled synthetic outlet coordinate and inspected the route map; both stops had recorded coordinates. These coordinates describe the test fixture, not verified competition outlet locations.

The first CHILLED order (`7720d2e1-31bc-4420-90fe-c4372f6b391b`) completed offline with 25 delivered units, a synthetic photo and a mouse-drawn synthetic signature. Arrival had already synchronized; **one completion operation** was pending during the production offline test. Offline reload retained both decoded local images. Reconnection synchronized the same operation and produced the authorized server photo (1000 × 700, 187,498 bytes) and signature (1000 × 360, 10,785 bytes). Driver, Store and Dispatcher read the same two attachment identities and SHA-256 hashes with the correct JPEG/PNG MIME and `private, no-store` responses. Anonymous reads returned 401 and Loader reads returned 403. Unfinished signature ink blocked completion; Clear removed the draft. The second 25-unit delivery completed without attachments, confirming they remain optional.

A 26-request read-only reconciliation before Store confirmation verified 25 ordered / 25 loaded / 25 delivered and **no receipt**. Store then explicitly confirmed 25 received units through its own UI. A separate 26-request reconciliation verified the same delivery/attachment IDs and hashes, the persisted receipt, 25 / 25 / 25 / 25 quantities, the completed 50-unit trip and unchanged access denials. Dispatcher inspected the resulting quantity chain, actual gallery and signature preview. Unsynchronized Driver work correctly blocked sign-out until synchronization finished.

The earlier judge order (`69fe8c92-e4e2-4aff-bf8b-fe903c9d4ed3`, version 13) and completed trip (`f87a6b94-d823-42c9-b05b-8a51804e830f`, version 20) remained unchanged: 192 ordered / 188 loaded / 188 delivered / 188 received, with the original receipt identity preserved. No reset or replacement of historical production delivery/receipt data was used.

The user explicitly authorized this laptop's real-location test. Share location entered the opt-in flow, but the browser's location provider returned **GPS is unavailable**. Delivery remained usable and sharing was stopped. Subsequent Driver, Store and Dispatcher location reads confirmed no stored position. This verifies the unavailable-GPS fallback, not successful receipt of a real location. Location emulation and touch-event simulation were unsupported; mouse drawing was verified. Physical mobile camera, finger/pen signature, onscreen keyboard, actual GPS reception and foreground permission/pause behavior remain pending.

Historical publication-safe production screenshots: [offline signature preview](screenshots/media-production-offline-signature.png), [synced Driver proof](screenshots/media-production-synced-proof.png), [Store proof before receipt](screenshots/media-production-store-proof.png), [Store after explicit receipt](screenshots/media-production-store-receipt.png), [Dispatcher proof](screenshots/media-production-dispatcher-proof.png), [signature preview](screenshots/media-production-signature-preview.png). All proof and operational data pictured are synthetic; no real device coordinates or confidential dataset records are included. These capture the completed feature acceptance before the later operational test-history cleanup.
