# Waypoint Pulse

**Team Code Crunchers · Tech-Triathlon 2026**

[![Docker Compose Verification](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/workflows/docker-compose-verification.yml/badge.svg)](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/workflows/docker-compose-verification.yml)

Waypoint Pulse is a responsive delivery-operations platform for the fictional **Waypoint Group**. It connects the complete delivery workflow across four roles:

**Store Manager → Dispatcher → Loader → Driver → Store Manager**

The system is built around one principle:

> **One order. One system. Four perspectives.**

It replaces fragmented spreadsheet, phone-call and paper-based coordination with a shared operational state, constraint-aware planning, explainable decisions, loading feedback, delivery records and receipt confirmation.

---

## Competition

- **Event:** Tech-Triathlon 2026
- **Team:** Code Crunchers
- **Phase:** Hackathon
- **Repository:** `CodeCrunchers_WaypointPulse`

### Submission links

| Item | Link |
| --- | --- |
| Source repository | https://github.com/sameer-jr/CodeCrunchers_WaypointPulse |
| Live application | _Add deployed URL before submission_ |
| Demo video | _Add unlisted YouTube URL before submission_ |
| Docker verification | [GitHub Actions](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/workflows/docker-compose-verification.yml) |

---

## What Waypoint Pulse solves

Waypoint Group operates a shared distribution network for three brands:

- **Waypoint Fresh** — groceries, chilled and frozen goods
- **Waypoint Style** — garments and cartons
- **Waypoint Tech** — appliances and consumer electronics

The operation must coordinate 120 outlets, two depots and a mixed vehicle fleet while handling:

- weight and volume limits
- ambient vs refrigerated transport
- van-only outlet access
- delivery and mall windows
- Fresh morning deadlines
- weekly fuel limits
- a maximum of two trips per vehicle per day
- loading shortages
- delivery exceptions
- unreliable field connectivity

Waypoint Pulse turns those constraints into a connected workflow rather than separate role-specific tools.

---

## Core workflow

```text
Store Manager
    │
    │ Place & confirm order
    ▼
Dispatcher
    │
    │ Review demand
    │ Generate plan
    │ Validate constraints
    │ Release plan
    ▼
Loader
    │
    │ Load by stop sequence
    │ Record actual quantities
    │ Report shortfalls
    ▼
Driver
    │
    │ Follow assigned trip
    │ Record outcome & proof
    ▼
Store Manager
    │
    └── Confirm receipt / report issue
```

All roles operate on the same persisted order, trip and delivery state.

---

## Key capabilities

### Dispatcher

- Today’s Delivery Pulse
- persisted order queue with filtering and search
- deterministic Planning Studio
- real vehicle/trip allocation
- independent plan validation
- **Explain My Plan** constraint evidence
- served/deferred decisions
- repeat-deferral visibility
- Routes / Trips
- operational Exception Centre
- honest Future Capacity placeholder without fabricated ML predictions

### Store Manager

- assigned-outlet Home
- Place Order
- server-side **16:00 Asia/Colombo** cutoff handling
- operating-day validation
- order tracking from persisted lifecycle data
- deferral visibility
- receipt confirmation
- quantity/damage issue reporting
- separate ordered, loaded, delivered and received quantities

### Loader

- released trips only
- real planner stop sequence
- loading checklist
- actual loaded quantities
- loading shortfall reporting
- Dispatcher manifest review
- guarded Ready for Dispatch state

### Driver

The Driver application shell is present in the repository. The final Driver delivery and offline/synchronization workflow is being completed for the Hackathon submission and should be verified against the final submitted commit.

---

## Signature planning feature — Explain My Plan

Waypoint Pulse does not treat planning as a black box.

The allocation engine produces structured evidence for each decision, including:

- depot compatibility
- vehicle availability
- temperature compatibility
- van-only access
- weight capacity
- volume capacity
- trip limits
- receiving windows
- mall windows
- Fresh deadline
- fuel quota
- trip-time feasibility

A served order can explain why its vehicle/trip was selected and why useful alternatives were rejected.

A deferred order retains machine-readable blocking reasons and a human-readable explanation.

The engine is deterministic and explainable; it does **not** use an LLM, ML model or the supplied precomputed allocation as its output.

---

## Allocation strategy

The planner uses an explainable heuristic rather than claiming global mathematical optimality.

Demand priority considers:

1. previous deferrals
2. scarcity of structurally compatible vehicles
3. receiving-window tightness
4. initial eligible date
5. creation time
6. stable order reference

Feasible candidates then prefer:

1. avoiding unnecessary use of scarce reefer/van capability
2. filling an existing draft trip before creating another
3. lower incremental estimated fuel
4. better remaining capacity fit
5. earlier completion
6. stable vehicle/trip tie-breakers

The complete generated plan is then checked by an **independent validator** before release.

Invalid or stale plans cannot be released.

---

## Loading Shortfall Cascade

Waypoint Pulse implements the Designathon degradation scenario as a real cross-role workflow.

Example:

```text
Ordered / expected: 192
Loaded:             188
Reason:             STOCK_UNAVAILABLE
```

Flow:

```text
Loader records 188
        │
        ▼
LOADING_SHORTFALL exception created
        │
        ▼
Trip readiness blocked
        │
        ▼
Dispatcher reviews revised manifest
        │
        ▼
Approved loaded quantity remains 188
        │
        ▼
Loader completes loading
        │
        ▼
Trip becomes READY_FOR_DISPATCH
```

The original ordered quantity is never overwritten.

---

## Architecture

```text
┌───────────────────────────────────────────────┐
│              React / Vite Web App             │
│                                               │
│ Dispatcher · Loader · Driver · Store Manager │
└───────────────────────┬───────────────────────┘
                        │ /api
                        ▼
┌───────────────────────────────────────────────┐
│                Express API                    │
│                                               │
│ Auth / RBAC / Scope Guards                    │
│ Order Lifecycle                               │
│ Planning & Validation                         │
│ Loading / Delivery / Receipt                  │
│ Audit & Exception Services                    │
└───────────────────────┬───────────────────────┘
                        │ Prisma
                        ▼
┌───────────────────────────────────────────────┐
│                 PostgreSQL                    │
│                                               │
│ Users · Orders · Vehicles · Trips · Stops     │
│ Allocations · Loads · Deliveries · Receipts   │
│ Exceptions · Deferrals · Audit Events         │
└───────────────────────────────────────────────┘
```

More detail:

- [Architecture documentation](docs/architecture.md)
- [Data model](docs/data-model.md)
- [AI disclosure](docs/AI_DISCLOSURE.md)

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

### Backend

- Node.js
- TypeScript
- Express
- Zod

### Persistence

- PostgreSQL
- Prisma ORM
- versioned SQL migrations
- transactional domain services
- database integrity guards

### Infrastructure

- Docker
- Docker Compose
- Nginx
- GitHub Actions

### Testing

- Vitest
- Supertest
- real PostgreSQL integration tests
- browser/responsive acceptance checks

---

## Repository structure

```text
CodeCrunchers_WaypointPulse/
│
├── apps/
│   ├── web/                 # React application
│   └── api/                 # Express API and domain services
│
├── packages/
│   └── shared/              # Shared schemas, DTOs and role contracts
│
├── prisma/                  # Schema, migrations and auth seed
├── scripts/                 # Setup, test and safe demo helpers
├── docs/                    # Architecture, data model and reports
│
├── .github/
│   └── workflows/
│       └── docker-compose-verification.yml
│
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

Competition datasets and private development resources are intentionally excluded from Git and Docker build contexts.

---

## Quick start with Docker

### Requirements

- Docker
- Docker Compose

Clone the repository:

```bash
git clone https://github.com/sameer-jr/CodeCrunchers_WaypointPulse.git
cd CodeCrunchers_WaypointPulse
```

Create your environment file:

```bash
cp .env.example .env
```

Review the values in `.env`, then start the complete stack:

```bash
docker compose up --build
```

Open:

```text
http://localhost:5173
```

The Compose stack starts:

- PostgreSQL
- API
- Web application

The API automatically applies the committed migrations and creates the safe demo accounts.

To stop:

```bash
docker compose down
```

To remove the development database volume as well:

```bash
docker compose down -v
```

---

## Docker verification

The root Compose stack is continuously checked by GitHub Actions on Ubuntu.

The verification workflow checks:

- API and Web image builds
- PostgreSQL health
- API health
- Web HTTP availability
- committed database migrations
- four safe seeded accounts
- database-backed login/session restoration
- protected endpoint authorization
- logout
- cleanup of containers and volumes

See:

- [Docker verification workflow](.github/workflows/docker-compose-verification.yml)
- [Remote Docker verification report](docs/remote-docker-verification.md)

> A successful CI run verifies the exact commit tested by the workflow. The final submission commit should also have a green Docker verification run.

---

## Local development without Docker

Node.js 24 LTS and npm are recommended.

Install dependencies:

```bash
npm install
```

Prepare local configuration:

```bash
npm run setup:local
```

Start the managed local PostgreSQL instance:

```bash
npm run dev:db
```

Keep that terminal running.

In a second terminal:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

For Windows PowerShell environments that block `npm.ps1`, use `npm.cmd`, for example:

```powershell
npm.cmd run dev
```

---

## Demo accounts

The default development seed uses:

**Password:** `WaypointDemo!2026`

| Role | Email | Default route |
| --- | --- | --- |
| Dispatcher | `dispatcher@waypoint.local` | `/dispatcher/pulse` |
| Loader | `loader@waypoint.local` | `/loader/loads` |
| Driver | `driver@waypoint.local` | `/driver/today` |
| Store Manager | `store@waypoint.local` | `/store/home` |

The password can be changed before initialization with `SEED_DEMO_PASSWORD`.

For a public deployment, use fresh deployment credentials and provide the final judge credentials through the competition submission.

---

## Judge walkthrough

> **Important:** The final submission walkthrough should be executed against the final deployed build. The current repository has the full Store → Dispatcher → Loader path implemented; Driver/offline completion should be verified on the final submission commit before using the Driver steps below.

### 1. Store Manager

1. Sign in as Store Manager.
2. Open **Place Order**.
3. Create a valid order.
4. Open **Track Delivery**.
5. Confirm the new order is persisted and awaiting planning.

### 2. Dispatcher

6. Sign out and sign in as Dispatcher.
7. Open **Orders** and find the same Store order.
8. Open **Planning Studio**.
9. Select the judge operational day.
10. Click **Generate Plan**.
11. Inspect served/deferred decisions.
12. Select an allocation and review **Explain My Plan**.
13. Click **Validate Plan**.
14. Confirm the plan has no blocking issues.
15. Click **Release Plan**.

### 3. Loader

16. Sign out and sign in as Loader.
17. Open **Today’s Loads**.
18. Open the released trip.
19. Confirm the actual planner stop sequence.
20. Record normal loaded quantities.
21. For the degradation stop, record a shortfall such as **192 expected → 188 loaded**.
22. Choose the shortfall reason and submit.
23. Confirm the trip is blocked awaiting review.

### 4. Dispatcher shortfall review

24. Sign in as Dispatcher.
25. Open **Exceptions**.
26. Open the same loading shortfall.
27. Review the expected/loaded quantities.
28. Approve the revised manifest.

### 5. Loader readiness

29. Return to Loader.
30. Confirm the approved revision appears.
31. Finish the remaining load records.
32. Mark the trip **Ready for Dispatch**.

### 6. Driver

33. Sign in as Driver.
34. Open the assigned ready trip.
35. Start the trip.
36. Open the next stop.
37. Record arrival, delivery outcome, quantity and recipient/proof metadata.
38. Complete the stop.

For the offline scenario:

39. Cache/open the route while online.
40. Switch the browser offline.
41. Record a delivery.
42. Confirm it is shown as **Pending Sync**.
43. Reload while offline and confirm the pending operation remains available.
44. Reconnect.
45. Sync.
46. Confirm the delivery exists exactly once.

### 7. Store receipt

47. Sign in as Store Manager.
48. Open the delivered order.
49. Verify ordered / loaded / delivered quantities.
50. Confirm receipt or report a discrepancy.

### 8. Dispatcher completion

51. Sign in as Dispatcher.
52. Confirm the trip/order progress and any final issue state.

---

## Verification commands

Run before submission:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:safety
```

Current completed implementation through the Loader milestone passed the full project verification suite with **246 automated tests**. The final submission commit should be re-tested after Driver/offline integration.

---

## Security and authorization

- salted `scrypt` password hashes
- HTTP-only session cookies
- only token HMAC digests stored in PostgreSQL
- server-owned roles
- backend authorization on protected routes
- object-level outlet/depot/trip scoping
- origin checks for mutations
- safe API DTOs
- no bearer token stored in `localStorage`
- optimistic version checks on critical mutations
- transactional operational state changes

The frontend never grants role, depot, outlet or trip ownership.

---

## Data confidentiality

The competition datasets are **not committed to this repository**.

Private resources such as:

- raw competition ZIPs
- official reference CSVs
- local imported data
- private prototype data
- local databases
- `.env`

are excluded from Git and Docker build contexts.

The repository contains the application, migrations, publication-safe authentication seed and independently authored synthetic development/test scenarios only.

---

## Designathon continuity

The Hackathon implementation follows the submitted Waypoint Pulse Designathon experience.

Preserved concepts include:

- one connected system for four roles
- Dispatcher Today’s Delivery Pulse
- Planning Studio
- Explain My Plan
- Loader loading workflow
- Loading Shortfall Cascade
- Driver mobile-first experience
- Store order tracking and receipt workflow
- light operational workspace
- charcoal navigation
- lime accent
- compact role-focused information architecture

### Significant implementation departures / clarifications

- A real credential login was added because the working system requires authenticated roles.
- Precise live GPS is not claimed because verified outlet coordinates were not supplied.
- The route experience therefore relies on operational stop sequence rather than fabricated live tracking.
- Scanner and reefer telemetry are not claimed as integrated hardware capabilities.
- Delivery proof currently prioritizes durable operational metadata; binary photo/signature storage is only claimed if present in the final build.
- Future Capacity does not fabricate Datathon predictions.
- Planning uses a deterministic explainable heuristic and an independent validator rather than claiming global optimization.

---

## Engineering documentation

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [AI assistance disclosure](docs/AI_DISCLOSURE.md)
- [Design and implementation plan](docs/design-and-implementation-plan.md)
- [Milestone 5 — Allocation Engine](docs/milestone-5-allocation.md)
- [Milestone 6 — Loader](docs/milestone-6-loader.md)
- [Remote Docker verification](docs/remote-docker-verification.md)

---

## AI assistance disclosure

AI-assisted work is documented transparently in:

[`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md)

AI tools assisted with implementation, code review, testing, documentation and development planning. The project brief and submitted Designathon remained the product specification, and final submission decisions remain the responsibility of **Team Code Crunchers**.

No AI service is required by the running Waypoint Pulse application.

---

## Known limitations

Current limitations that should be reviewed before the final Hackathon submission:

- Driver delivery/offline synchronization is still being completed at the time of this README revision.
- precise live GPS is not available
- binary delivery-proof storage is not yet claimed
- Future Capacity has no Datathon prediction integration
- authoritative current/future competition calendar data was not supplied beyond the available reference horizon
- production deployment must use fresh secrets and deployment-specific credentials

These limitations are stated explicitly rather than represented as completed functionality.

---

## Team

**Code Crunchers**

Tech-Triathlon 2026 — Hackathon

---

## License / competition use

This repository was created for the Tech-Triathlon 2026 competition.

Competition datasets are subject to the competition’s confidentiality and usage rules and are intentionally not distributed through this repository.
