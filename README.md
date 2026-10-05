# Waypoint Pulse

**Team Code Crunchers · Tech-Triathlon 2026 Hackathon**

[![Docker Compose Verification](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/workflows/docker-compose-verification.yml/badge.svg)](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/workflows/docker-compose-verification.yml)

Waypoint Pulse is a responsive delivery-operations platform for the fictional **Waypoint Group**. It connects the complete delivery workflow across four roles through one shared operational state:

**Store Manager → Dispatcher → Loader → Driver → Store Manager**

> **One order. One system. Four perspectives.**

---

## Submission links

| Resource | Link |
| --- | --- |
| **Live application** | https://web-production-87afe.up.railway.app |
| **Source repository** | https://github.com/sameer-jr/CodeCrunchers_WaypointPulse |
| **Docker verification** | https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/workflows/docker-compose-verification.yml |
| **Demo video** | **Not recorded yet.** NULL |

---

## Judge credentials

The public Railway deployment uses the following seeded accounts.

**Password for all four accounts:** `WaypointJudge!2026`

| Role | Email | Main screen |
| --- | --- | --- |
| Dispatcher | `dispatcher@waypoint.local` | `/dispatcher/pulse` |
| Loader | `loader@waypoint.local` | `/loader/loads` |
| Driver | `driver@waypoint.local` | `/driver/today` |
| Store Manager | `store@waypoint.local` | `/store/home` |

**Judge operational day:** `2040-03-05`

> The public deployment contains an independently authored **SYNTHETIC** judge scenario so the competition dataset is not redistributed through the public repository.

---

## What Waypoint Pulse solves

Waypoint Group operates a shared distribution network serving:

- **Waypoint Fresh** — groceries, chilled and frozen goods
- **Waypoint Style** — garments and cartons
- **Waypoint Tech** — appliances and consumer electronics

The delivery operation must coordinate shared fleet capacity while respecting:

- weight and volume limits
- ambient vs refrigerated transport
- van-only outlet access
- delivery and mall receiving windows
- Fresh morning deadlines
- weekly fuel limits
- a maximum of two trips per vehicle per day
- loading shortages and delivery exceptions
- unreliable field connectivity

Waypoint Pulse replaces fragmented spreadsheet, phone-call and paper coordination with a connected, auditable workflow.

---

## End-to-end workflow

```text
Store Manager
     │
     │ creates order
     ▼
Dispatcher
     │
     │ Generate → Explain → Validate → Release
     ▼
Loader
     │
     │ load checklist → report shortfall
     ▼
Dispatcher
     │
     │ approve/reject revised manifest
     ▼
Loader
     │
     │ Ready for Dispatch
     ▼
Driver
     │
     │ route → delivery → offline queue → sync
     ▼
Store Manager
     │
     │ confirm receipt / report issue
     ▼
Dispatcher
     └── final operational visibility
```

All roles work on the same persisted orders, trips, quantities, exceptions and audit history.

---

# Final Judge Walkthrough

The live environment has already been used for final verification, so some records may show completed history. For a fully repeatable mutation walkthrough, use a fresh judge installation as described under **Fresh Competition Judge Installation**.

Use **2040-03-05** throughout the walkthrough.

### 1. Dispatcher — Generate, validate and release

1. Sign in as `dispatcher@waypoint.local`.
2. Open **Planning Studio**.
3. Select **2040-03-05** and the assigned SYNTHETIC depot.
4. Click **Generate Plan**.
5. Inspect served and deferred orders.
6. Open **Explain My Plan** for a served or deferred order.
7. Review the actual constraint evidence.
8. Click **Validate** and confirm the independent validator returns a valid plan.
9. Click **Release** and confirm the release dialog.
10. Note the actual released trip containing `SYN-LOADER-DRIVER-ORDER-192`.

### 2. Loader — Load the released trip

11. Sign out and sign in as `loader@waypoint.local`.
12. Open **Today's Loads** for **2040-03-05**.
13. Open the released ambient trip.
14. Mark the normal stops as loaded.
15. For the 192-unit order, choose **Report Shortfall**.
16. Enter **188** actual loaded units.
17. Select **Stock unavailable** and enter a useful shortage note.
18. Submit the shortfall.
19. Confirm the trip is blocked with **Awaiting Dispatcher approval**.

### 3. Dispatcher — Review the shortfall

20. Sign in again as Dispatcher.
21. Open **Exception Centre**.
22. Open the same loading-shortfall record.
23. Verify **192 expected / 188 loaded**.
24. Approve the revised manifest.

### 4. Loader — Ready for Dispatch

25. Return to Loader.
26. Reopen the same trip.
27. Confirm **Dispatcher approved this revision**.
28. Complete any remaining normal loads.
29. Click **Mark Ready for Dispatch**.

### 5. Dispatcher — Assign Driver

30. Sign in as Dispatcher.
31. Open the same trip in **Routes / Trips**.
32. Assign `driver@waypoint.local`.
33. Sign out.

### 6. Driver — Deliver with offline recovery

34. Sign in as `driver@waypoint.local`.
35. Select **2040-03-05** and open the assigned trip.
36. Confirm the route is cached and **Offline reload ready**.
37. Click **Start Trip** while online.
38. Switch the browser network to **Offline**.
39. Record arrival at the 192-unit stop.
40. Open **Proof**.
41. Select **Delivered**.
42. Enter **188** delivered units.
43. Enter recipient name, receiving role and a useful note.
44. Save the delivery.
45. Confirm the arrival and completion operations are shown as **Pending sync**.
46. Reload the browser while still offline.
47. Confirm the route, recipient, note and pending work remain available.
48. Restore the network.
49. Wait for automatic synchronization or click **Sync now**.
50. Confirm pending operations become **SYNCED**.
51. Reload online and confirm the server-side delivery proof.
52. Complete the remaining stops in sequence.
53. Click **Finish Trip** when every stop has a terminal outcome.

### 7. Store Manager — Confirm receipt

54. Sign in as `store@waypoint.local`.
55. Open **Track Delivery**.
56. Open `SYN-LOADER-DRIVER-ORDER-192`.
57. Verify:
   - **Ordered:** 192
   - **Loaded:** 188
   - **Delivered:** 188
   - **Received:** Not recorded
58. Open **Confirm Receipt**.
59. Enter **188** as the quantity actually received.
60. Select **Received in good condition**.
61. Confirm the receipt.
62. Reload and verify the receipt remains persisted.

### 8. Dispatcher — Final verification

63. Sign in as Dispatcher.
64. Reopen the same day/order/trip.
65. Verify the final quantity chain: **192 ordered / 188 loaded / 188 delivered / 188 received**.
66. Confirm the trip is completed and the loading-review history remains visible.

---

## Key capabilities

### Dispatcher

- Today’s Delivery Pulse
- scoped order queue
- deterministic Planning Studio
- real allocation to vehicles and trips
- independent plan validation
- served and deferred decisions
- **Explain My Plan**
- capacity, temperature, outlet-access, delivery-window and fuel checks
- Routes / Trips
- Exception Centre
- Driver assignment
- scoped outlet coordinates, trip maps and reported Driver position
- authorized delivery photo/signature gallery

### Loader

- phone-responsive released-load workflow
- actual planner stop sequence
- quantity checklist
- persisted loaded quantities
- shortfall reporting
- Dispatcher approval/rejection
- guarded Ready for Dispatch

### Driver

- phone-first Today / Route / Proof / Offline-Sync experience
- assigned ready trips only
- persisted start, arrival and delivery outcomes
- delivered quantity cannot exceed loaded quantity
- recipient/outcome proof with optional photos and a touch signature
- PWA application shell
- per-user IndexedDB route cache
- durable UUID offline operation queue
- offline reload
- ordered reconnect synchronization
- idempotent replay
- retained visible conflicts
- offline media payloads and pending previews
- optional foreground location sharing for an active trip

### Store Manager

- assigned-outlet Home
- Place Order
- server-side 16:00 Asia/Colombo cutoff handling
- persisted tracking
- deferral visibility
- ordered / loaded / delivered / received quantities kept separate
- explicit receipt confirmation
- quantity, damage and other receipt issues
- authorized delivery photos/signature and a map restricted to its own stop

---

## Explain My Plan

The photo/signature/maps follow-up is described under [Current feature verification](#current-feature-verification). Its Linux CI and production acceptance are separate from the earlier verified release.

Waypoint Pulse does not treat planning as a black box.

The allocation engine stores real evidence for constraint checks such as:

- depot match
- vehicle availability
- temperature compatibility
- van-only access
- weight capacity
- volume capacity
- maximum trips per day
- receiving windows
- mall windows
- Fresh morning deadline
- fuel quota
- complete trip-time feasibility

Served decisions retain the checks behind their assignment and limited rejected alternatives. Deferred decisions retain machine-readable blocking reasons.

The planner is deterministic and explainable. It does **not** call an LLM, ML model or the supplied precomputed allocation as its planning result.

---

## Planning strategy

Demand priority considers:

1. previous deferrals
2. scarcity of structurally compatible vehicles
3. receiving-window tightness
4. initial eligible date
5. order creation time
6. stable order reference

Feasible candidates then prefer:

1. preserving scarce reefer/van capability when unnecessary
2. filling an existing draft trip before creating another
3. lower incremental estimated fuel
4. better remaining weight and volume fit
5. earlier completion
6. stable vehicle/trip tie-breakers

A separate validator independently re-checks the persisted generated result before release.

---

## Technology stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS
- Service Worker
- IndexedDB
- Leaflet maps with on-demand OpenStreetMap tiles

### Backend

- Node.js
- TypeScript
- Express
- Zod

- Sharp image validation and re-encoding

### Persistence

- PostgreSQL
- Prisma ORM
- 30 normalized models
- 10 versioned SQL migrations
- transactional domain services
- database integrity guards

### Infrastructure

- Docker
- Docker Compose
- Nginx
- GitHub Actions
- Railway
- Railway-managed PostgreSQL

### Testing

- Vitest
- Supertest
- real PostgreSQL integration tests
- browser acceptance checks
- deployed offline/reconnect verification

---

## Architecture

```text
┌─────────────────────────────────────────────┐
│              React / Vite Web               │
│                                             │
│ Store · Dispatcher · Loader · Driver        │
│ Driver PWA + IndexedDB offline queue        │
└────────────────────┬────────────────────────┘
                     │ /api
                     ▼
┌─────────────────────────────────────────────┐
│                Express API                  │
│                                             │
│ Auth / RBAC / Scope                         │
│ Order Lifecycle                             │
│ Planning Engine                             │
│ Independent Validator                       │
│ Loading / Delivery / Receipt                │
│ Exceptions / Audit                          │
│ Idempotent Offline Sync                     │
└────────────────────┬────────────────────────┘
                     │ Prisma
                     ▼
┌─────────────────────────────────────────────┐
│                PostgreSQL                   │
│                                             │
│ Users · Orders · Vehicles · Trips · Stops   │
│ Allocations · Loads · Deliveries · Receipts │
│ Exceptions · Deferrals · OfflineOperations  │
│ Audit Events                                │
└─────────────────────────────────────────────┘
```

Detailed documentation:

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [AI disclosure](docs/AI_DISCLOSURE.md)
- [Final Hackathon verification — historical release](docs/final-hackathon-verification.md)
- [Photo/signature/maps verification — current update](docs/media-maps-verification.md)

---

## Repository structure

```text
CodeCrunchers_WaypointPulse/
├── apps/
│   ├── web/                 # React application and Driver PWA
│   └── api/                 # Express API and domain services
├── packages/
│   └── shared/              # Shared schemas and DTOs
├── prisma/                  # Schema, migrations and seed
├── scripts/                 # Setup, verification and judge helpers
├── docs/                    # Architecture, data model, disclosure and reports
├── .github/
│   └── workflows/
│       └── docker-compose-verification.yml
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

Private competition resources are intentionally excluded from Git and Docker build contexts.

---

# Fresh Competition Judge Installation

The repository can be run as a complete Docker stack.

### Requirements

- Git
- Docker Engine or Docker Desktop
- Docker Compose

### 1. Clone

```bash
git clone https://github.com/sameer-jr/CodeCrunchers_WaypointPulse.git
cd CodeCrunchers_WaypointPulse
```

### 2. Create environment configuration

Linux/macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Before startup, configure:

```env
POSTGRES_USER=waypoint
POSTGRES_PASSWORD=<fresh-local-database-password>
POSTGRES_DB=waypoint

AUTH_SECRET=<fresh-random-secret-at-least-32-characters>

SEED_DEMO_PASSWORD=WaypointDemo!2026

WEB_PORT=5173
WEB_ORIGIN=http://localhost:5173
NODE_ENV=development

PUBLIC_JUDGE_DEMO=true
```

`PUBLIC_JUDGE_DEMO=true` enables the independently authored publication-safe judge scenario for **2040-03-05**.

### 3. Start the complete stack

```bash
docker compose up --build
```

This starts:

- PostgreSQL
- API
- Web application
- committed database migrations
- seeded judge accounts
- publication-safe operational judge data

Open:

```text
http://localhost:5173
```

Health:

```text
http://localhost:5173/api/health
```

### 4. Local judge credentials

The checked-in example development password is:

```text
WaypointDemo!2026
```

Accounts:

```text
dispatcher@waypoint.local
loader@waypoint.local
driver@waypoint.local
store@waypoint.local
```

### 5. Stop

```bash
docker compose down
```

To also remove the local database volume:

```bash
docker compose down -v
```

---

## Shared competition dataset

The organizer-provided shared dataset is **not redistributed through this public repository**.

The application includes a validated importer for the five shared reference files:

```text
outlets.csv
vehicles.csv
calendar.csv
district_travel.csv
service_allowance.csv
```

Private files can be placed under:

```text
private-data/reference/
```

and imported with:

```bash
npm run import:reference -- --source official --dry-run
npm run import:reference -- --source official
```

The public judge environment instead uses independently authored data labelled **SYNTHETIC** so confidential competition records are not exposed.

No raw competition ZIP, official CSV, private `.env`, local database or original private prototype source is committed to this repository.

---

## Docker verification

The root Compose stack is verified on GitHub Actions using Ubuntu. The previous release passed; the exact-commit Linux run for the photo/signature/maps update is pending.

Local development can run without Docker using `npm run setup:local`, `npm run dev:db` and, in another terminal, `npm run dev`. Competition startup remains `docker compose up --build`; CI verifies that same container stack on Linux.

The workflow checks:

- API image build
- Web image build
- PostgreSQL startup
- API/Web/database health
- all ten migrations
- seeded authentication
- protected access
- session restore
- logout
- container and volume cleanup

Workflow:

[`.github/workflows/docker-compose-verification.yml`](.github/workflows/docker-compose-verification.yml)

The previous functional release passed Docker verification. A new PASS will be reported only after the current feature commit actually completes its Linux workflow successfully.

---

## Public deployment

The production system is deployed on **Railway**.

**Live URL:**\
https://web-production-87afe.up.railway.app

Topology:

```text
Public HTTPS Web
      │
      │ same-origin /api
      ▼
Private API
      │
      ▼
Private Railway PostgreSQL
```

The previously deployed release was verified for:

- HTTPS
- secure cookies
- all four seeded accounts
- protected role access
- Dispatcher planning
- Loader shortfall handling
- Driver delivery
- real browser offline reload
- reconnect synchronization
- Store receipt
- final Dispatcher reconciliation

Railway deployment and four-role/offline media/map acceptance of the current feature commit are pending. The older deployed PASS does not establish acceptance of the photo/signature/maps update.

---

## Verification

Run before making a submission release:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:safety
```

Current local automated suite:

```text
351 / 351 tests passed across 15 files
10 additive migrations
30 Prisma models
```

See:

[Media and maps verification — current update](docs/media-maps-verification.md)

[Final Hackathon verification — historical release](docs/final-hackathon-verification.md)

---

## Current feature verification

The authorized update enables Driver camera/JPEG-PNG upload, preview/removal and a touch signature with **Use signature / Clear signature**. Each delivery accepts up to three photos of 1 MiB each and one signature of 256 KiB. Images are resized, validated and re-encoded before private immutable PostgreSQL storage. Driver, its Store and permitted Dispatcher can view the actual attachments through authenticated `no-store` image reads; an absent attachment is explicitly shown as not captured. Store receipt remains a separate action.

**Complete Delivery** first saves its media and UUID operation in the scoped IndexedDB queue. Offline reload retains pending local previews; reconnect/retry uses the identical operation and attachment bytes. A failed device write reports that the action was not saved and keeps the form available. Keep the device/session until synchronization succeeds; clearing/exhausting storage can lose unsynced work.

Maps use explicitly recorded outlet coordinates and optional browser-reported Driver positions. Dispatcher coordinate edits require scope, expected version and a reason; no coordinates are invented or seeded from outlet/district names. Driver **Share location** requires an assigned in-transit trip, permission and HTTPS/localhost. It reports at most once per ten seconds while connected and visible, pauses offline/hidden and requires a new opt-in after reload. Accuracy and freshness are shown; offline, completed or older-than-two-minute positions are historical. Store map reads include only its own stop.

**Show route map** loads Leaflet and external OpenStreetMap tiles on demand with attribution. The [tile service policy](https://operations.osmfoundation.org/policies/tiles/) applies; tile availability and viewed-area browser requests are external. No offline tile prefetch is provided. Sequence lines are not driving directions, and GPS does not generate an ETA. Stop/proof workflows remain usable without tiles or GPS permission.

| Current-update evidence | Status |
| --- | --- |
| Local automated suite | **PASS — 351/351 across 15 files** |
| Schema | **30 models / 10 additive migrations**; the prior nine migration files remain unchanged |
| Browser/media/offline acceptance | Actual observations are recorded separately in [media and maps verification](docs/media-maps-verification.md) |
| Exact feature commit's Linux Docker CI | **Pending** — previous-release Docker PASS does not verify this update |
| Matching Railway deployment and production media/map smoke | **Pending** — previous-release production PASS does not verify this update |
| Physical mobile camera/signature/GPS/keyboard acceptance | **Pending** |

The [update report](docs/media-maps-verification.md) contains endpoint/storage/scope limits and the full acceptance checklist. Existing milestone and [final-release evidence](docs/final-hackathon-verification.md) remains historical. No demo video has been recorded or linked yet.

---

## Security and authorization

Waypoint Pulse uses:

- salted Node `scrypt` password hashes
- opaque HTTP-only session cookies
- server-owned roles
- server-side resource authorization
- outlet/depot/trip object scope
- request-origin checks for mutations
- safe DTOs
- optimistic version guards
- transactional operational writes
- UUID idempotency keys for Driver sync

No bearer authentication token is stored in browser `localStorage`.

Driver IndexedDB stores scoped operational data only; passwords, session tokens and raw competition data are not stored there.

---

## Designathon fidelity and significant departures

The Hackathon implementation follows the submitted Waypoint Pulse Designathon specification.

Preserved concepts include:

- one connected system for four roles
- Today’s Delivery Pulse
- Planning Studio
- Explain My Plan
- Loader loading workflow
- Loading Shortfall Cascade
- Driver mobile-first workflow
- Driver Offline / Sync experience
- Store tracking and receipt
- light workspace
- charcoal navigation
- lime accent
- role-focused information architecture

Significant implementation clarifications/departures:

- real credential login replaces the prototype experience selector
- outlet maps use explicitly recorded coordinates; no locations are invented from outlet or district identifiers
- optional browser-reported Driver positions show accuracy and freshness; stop sequence lines do not calculate driving directions
- no barcode-scanner hardware integration is claimed
- no reefer telemetry integration is claimed
- delivery proof stores recipient/outcome/quantity/note/time and optional bounded photos/signature as private PostgreSQL evidence
- Future Capacity deliberately does not fabricate Datathon predictions
- the allocation engine is a deterministic explainable heuristic with an independent validator rather than a claimed global optimizer

---

## Known limitations

- No continuous background tracking, location-history log, turn-by-turn directions or GPS-derived ETA. Location sharing is optional, foreground-only and permission-dependent.
- No barcode-scanner hardware integration.
- No reefer telemetry.
- Media is stored in the existing PostgreSQL database; no external image bucket or public upload directory is used. Browser storage loss can lose unsynced attachments.
- No Datathon prediction integration.
- The authoritative future official competition calendar is unavailable; the reproducible public judge uses SYNTHETIC day `2040-03-05`.
- Clearing browser storage or losing the device can lose unsynchronized Driver work.
- Failed/conflicted offline operations remain visible for review; there is no automatic conflict rebase/discard workflow.
- Physical-device camera/signature/GPS/onscreen-keyboard acceptance remains pending; a controlled browser check is separate evidence.
- `actualReturn` is not fabricated; trip completion records the completed stop workflow.

---

## AI assistance disclosure

AI assistance is documented in:

[`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md)

AI tools assisted with areas including:

- development planning
- scaffolding
- implementation support
- refactoring
- testing
- debugging/review
- documentation

The original team product concept and submitted Designathon remain the project specification and team work.

No AI service is required by the running Waypoint Pulse application. The planning engine itself is deterministic and does not call an LLM.

---

## Engineering documentation

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [AI disclosure](docs/AI_DISCLOSURE.md)
- [Design / implementation plan](docs/design-and-implementation-plan.md)
- [Allocation Engine report](docs/milestone-5-allocation.md)
- [Loader report](docs/milestone-6-loader.md)
- [Driver / Offline report](docs/milestone-7-8-driver-offline.md)
- [Railway deployment](docs/deployment-railway.md)
- [Final Hackathon verification — historical release](docs/final-hackathon-verification.md)
- [Photo/signature/maps verification — current update](docs/media-maps-verification.md)
- [Demo script](docs/demo-script.md)

---

## Team

**Code Crunchers**\
**Tech-Triathlon 2026 — Hackathon**

---

## Competition data and repository use

This repository was created for the Tech-Triathlon 2026 competition.

Organizer-provided competition datasets remain subject to the competition's confidentiality and usage rules and are intentionally not redistributed through this public repository.
