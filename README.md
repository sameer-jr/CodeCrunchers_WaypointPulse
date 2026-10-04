# Waypoint Pulse

Team Code Crunchers · Tech-Triathlon 2026

## Current scope

Milestones 1–4 establish credential login, sessions, responsive role shells, the normalized operational domain, the persisted Store Manager workflow and Dispatcher views. Milestone 5 adds locally verified deterministic allocation, independent validation and transactional plan release in Planning Studio. Pulse, Orders, Routes / Trips and Exception Centre read scoped PostgreSQL records; Future Capacity states its current limits. Milestone 6 connects released generated trips to Loader’s persisted checklist, shortfall reporting, Dispatcher review and Ready for Dispatch. Driver, offline synchronization and predictions remain later milestones.

The original Designathon prototype remains unchanged under `input resources/prototype/` following the workspace's reference-file reorganization. It is a private local reference and is excluded from Git and Docker. The root application copies only the two brand PNGs. The supplied dataset ZIP is private and is not imported by the auth seed or bundled into the web app.

## Architecture and technology

- npm workspaces; TypeScript; React/Vite; React Router; TanStack Query; Zod; React Hook Form; Tailwind CSS.
- Express API, Zod request validation, centralized authentication/authorization/error handling.
- PostgreSQL with Prisma: User/Session plus 24 normalized domain/support models, explicit daily VehicleAvailability, transactional services and SQL integrity guards.
- Passwords use salted Node scrypt. Random opaque session tokens are issued as HTTP-only, SameSite=Strict cookies. Only an HMAC digest of each token is stored in PostgreSQL. User role and active status are checked on every protected API request.
- Role routes are protected in the client and server; failed cross-role client navigation shows an access-denied page. There is no authenticated role-switch control.
- [Architecture](docs/architecture.md), [data model](docs/data-model.md), [AI disclosure](docs/AI_DISCLOSURE.md).
- [Milestone 1 verification report](docs/milestone-1-foundation.md), including browser evidence and the unverified Docker runtime limitation.
- [Milestone 2 verification report](docs/milestone-2-domain.md), including real database upgrades, private import and 46 automated tests.
- [Milestone 3 Store report](docs/milestone-3-store.md), including scoped creation, cutoff, tracking, receipts, 102 automated tests and browser evidence.
- [Milestone 4 Dispatcher report](docs/milestone-4-dispatcher.md), including date context, depot scope, read-only planning and cross-role verification.
- [Milestone 5 allocation report](docs/milestone-5-allocation.md), including heuristic, constraints, timing/fuel assumptions, independent validation and release verification status.

## Repository structure

```text
apps/web/          React application, brand assets, Nginx configuration
apps/api/          Express transport, domain services and PostgreSQL tests
packages/shared/   Shared roles, auth schemas, safe API identity types
prisma/            Normalized schema, versioned SQL migrations, auth-only seed
scripts/           Local setup, embedded PostgreSQL, test and safety runners
docs/              Audit, design plan, architecture and milestone report
input resources/   Private original brief/prototype/dataset ZIP (not published)
private-data/      Private reference CSV import sources (not published)
```

## Prerequisites

Use Node.js 24 LTS and npm. A PostgreSQL service or Docker is optional for local development: `dev:db` uses a workspace-local PostgreSQL binary installed through the `embedded-postgres` npm dependency. It does not install a system service or create a system user.

If Windows PowerShell blocks `npm.ps1`, use `npm.cmd` for these commands; no execution-policy change is needed.

On Windows, stop the API before installing dependencies or generating Prisma: the running API locks its native query-engine DLL. Local database start/stop uses PostgreSQL's `pg_ctl` so shutdown waits for its worker processes to finish.

## Development setup

```sh
npm install
npm run setup:local
npm run dev:db
```

Leave that terminal running. In a second terminal:

```sh
npm run dev
```

Open **http://localhost:5173**. The API listens privately on port 3001 and the Vite proxy serves `/api` at the same browser origin. Use `localhost` consistently with `WEB_ORIGIN`; a `127.0.0.1` browser origin is different. If you choose another browser origin, update `WEB_ORIGIN` accordingly.

`setup:local` creates ignored `.env` with random local database/session secrets and preserves an existing `.env`. `dev:db` initializes `.local/postgres`, applies migrations, and seeds users before reporting readiness. Ctrl+C stops the cluster but retains local data. Its managed database must be `/waypoint` on `127.0.0.1`; another DATABASE_URL requires your own database service.

For an existing PostgreSQL service, configure `.env` from `.env.example`, create the empty database, then run:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Do not use development credentials for a shared deployment. Passwords with reserved URL characters must be encoded in DATABASE_URL; the generated local passwords are hexadecimal.

## Demo accounts

The development password generated from `.env.example` is **`WaypointDemo!2026`**. Configure `SEED_DEMO_PASSWORD` before first initialization to change it; it must be 12–128 characters. The seed creates missing accounts and deliberately preserves existing users, passwords, roles, and active status on repeated startup. Changing the seed environment does not rotate existing accounts.

| Email | Role | Home |
| --- | --- | --- |
| dispatcher@waypoint.local | DISPATCHER | `/dispatcher/pulse` |
| loader@waypoint.local | LOADER | `/loader/loads` |
| driver@waypoint.local | DRIVER | `/driver/today` |
| store@waypoint.local | STORE_MANAGER | `/store/home` |

The login demo selector fills the email only. The password is verified by the server. No competition data or domain assignments are seeded. Without explicit UserOutlet/UserDepot or driver-trip assignments, domain object access defaults to denial.

## Private reference import

Place the five official files in ignored `private-data/reference/`: `outlets.csv`, `vehicles.csv`, `calendar.csv`, `district_travel.csv`, `service_allowance.csv`. With the configured database running:

```sh
npm run import:reference -- --source official --dry-run
npm run import:reference -- --source official
```

`--directory` can select another directory within ignored `private-data/` or `input resources/`. Provenance must be explicit; all files are required. The importer validates exact headers, explicit numeric/enum/time/date conversions, positive capacities, duplicate keys and references before an atomic database import. Content digests make repeated imports a no-op. Changed sources that collide with existing keys fail without partial changes; reconciliation is not silently performed. Synthetic imports require explicit labelling and are forbidden in production. Imports do not grant user assignments or create orders, trips or allocations.

The supplied private ZIP contains all five expected reference files. The local import has 120 outlets, 60 vehicles, 910 calendar days, 12 travel rows and 9 service allowances, marked OFFICIAL. These counts describe the private import, not installation seed data. The official calendar ends on **2026-06-28**, so it cannot authorize future orders on the current review date, 2026-10-03. A fresh official calendar is required for current official operation. The Store API blocks dates absent from its eligible calendar. Raw files remain excluded from Git, Docker and web bundles. No source GPS/address fields or verified opening fuel history were supplied. Fuel remaining is unknown until an opening balance is established; quota alone does not imply zero consumption. Business dates/weeks use Asia/Colombo; the fuel week begins Monday.

Deploy the committed migrations rather than `prisma db push`; custom SQL checks, partial indexes and integrity/history triggers are required. Delivery proof currently stores durable key metadata only; actual file storage is deferred.

## Store assignment and local review

The auth seed does not assign outlets. Store access requires exactly one active user's `UserOutlet` mapping; missing or multiple mappings deny access. With the local database running, an explicit operator command assigns a known outlet. Add `--replace` only to deliberately change an existing assignment:

```sh
npm run demo:assign-store -- --outlet-id <outlet-uuid>
```

`--outlet-ref` is also supported for private local references; `--email` defaults to `store@waypoint.local`. The script rejects production and non-loopback databases. Identity never comes from the frontend.

For current-date review when the official calendar has no future rows:

```sh
npm run demo:store-synthetic
```

This explicit local-only command adds an independently authored **SYNTHETIC** Fresh outlet, assigns the Store demo account, and inserts up to 60 future synthetic calendar days without replacing existing official days. Its Monday–Saturday pattern belongs only to this fixture. Set `STORE_ALLOW_SYNTHETIC=true` in ignored local `.env` and restart the API to permit those labelled dates. The flag defaults to false and is forbidden in production. The current local preview uses this opt-in. No orders, plans or deliveries are created by this setup command.

For prepared receipt, planned-arrival and deferral review, `npm run demo:store-judge` creates a separate loopback database named `waypoint_store_judge` and five labelled scenarios. Stop the normal API/web app, keep PostgreSQL running, and temporarily change only the database name in private `DATABASE_URL` from `/waypoint` to `/waypoint_store_judge`. Keep `STORE_ALLOW_SYNTHETIC=true` and run `npm run dev` using the usual localhost origin/ports. Sign in as Store Manager and select a `SYN-JUDGE-*` order. After review, stop that app and restore `/waypoint` before restarting. The setup helper itself does not change `.env`, official references or the main development assignment. See the Store report for scenario references and outcomes; these prepared records do not demonstrate Dispatcher, Loader or Driver workflows. If running separate previews on different ports, cookies on the same hostname are shared: keep only one active Store browser preview.

## Store workflow and API

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/store/context` | Assigned outlet, server time/cutoff, brand rules, imported operating dates |
| GET | `/api/store/home` | Persisted counts, recent orders and attention items |
| GET | `/api/store/orders?status=&date=` | Scoped list, newest 100; date filters originally requested delivery date |
| GET | `/api/store/orders/:id` | Scoped quantities, recorded timeline, deferrals, trip and proof metadata |
| POST | `/api/store/orders` | Atomic validated order creation and confirmation |
| POST | `/api/store/orders/:id/receipt` | Versioned atomic receipt and any actionable exception |

Fresh supports ambient/chilled/frozen requests; Style and Tech support ambient. Daily, weekly and as-needed descriptions are operational context, not a product catalog or automatic schedule. The server derives outlet, brand, depot and creator. References use `WP-YYYYMMDD-` followed by a UUID without separators; counts are never used for uniqueness.

The server applies the **16:00 Asia/Colombo** cutoff, including exactly 16:00. A tomorrow request at/after cutoff keeps its original requested date and creation timestamp, and receives the next later operating `CalendarDay` as `eligibleDeliveryDate`. Today/past, malformed, missing or non-operating dates are rejected; lack of a later eligible run rejects the late request. The UI explains any shift and the response is authoritative.

Tracking displays actual persisted audit events, deferrals and planned/actual stop timestamps. Unplanned orders remain confirmed/awaiting planning without vehicle or ETA. Proof displays saved recipient/evidence metadata only; image/signature content is unavailable.

Receipts retain ordered, loaded, delivered and received quantities independently. Matching good-condition receipts become `CONFIRMED` / `RECEIPT_CONFIRMED`. A quantity difference, damage or other reported issue requires a useful note and creates `ISSUE_REPORTED`, an unresolved exception and `RECEIPT_ISSUE`; it does not cleanly close the order. Duplicate/stale receipts conflict, and Store Managers cannot read or mutate foreign outlet orders.

## Dispatcher assignment and local review

Dispatcher access requires an active Dispatcher account with one or more explicit `UserDepot` assignments. Missing scope denies every Dispatcher data endpoint. The auth seed never grants these mappings. Assign only the depots needed for local review:

```sh
npm run demo:assign-dispatcher -- --depot-name "SYNTHETIC Store Demo Depot"
```

`--depot-id` is also supported. Repeat the same option for multiple depots, use `--email` for another active Dispatcher, and add `--replace` only to deliberately replace an existing local assignment. The command rejects production and non-loopback databases. The UI cannot grant or enlarge scope.

For reproducible Dispatcher review, keep `npm run dev:db` running and use:

```sh
npm run demo:dispatcher-judge
npm run dev:dispatcher-judge
```

Open **http://localhost:5175**. This separate `/waypoint_dispatcher_judge` database uses independently authored **SYNTHETIC** references and a fixed default operational day, **2040-02-06**. The helper preserves `.env`, main development records and official references. It installs confirmed demand across Fresh/Style/Tech, all three Fresh temperature requirements, a van-only outlet, two persisted deferrals, explicitly prepared trips and receipt scenarios. Prepared trips demonstrate reading persisted facts; they are not generated plans. The Store account is assigned to `SYN-STORE-FRESH`, and Dispatcher has the minimum own-depot scope. Rerunning setup preserves orders and receipts already entered during review.

The judge preview uses API port 3002 and Vite port 5175; Ctrl+C stops both preview processes and retains its data. Session cookies share a hostname across ports: keep only one active localhost application tab during role handoffs. The optional `DISPATCHER_DEMO_DATE` environment value selects a default day and creates no calendar rows. Otherwise the server chooses meaningful scoped persisted demand/trip dates before falling back to the current Sri Lanka date. Date selection survives navigation and refresh in the URL.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/dispatcher/context` | Assigned depots, selected day and actual calendar provenance |
| GET | `/api/dispatcher/pulse` | Complete scoped counts, fleet master totals and open attention |
| GET | `/api/dispatcher/orders` | Date-basis, status, brand, depot, district, temperature, deferral and reference filters |
| GET | `/api/dispatcher/orders/:id` | Four quantity facts, dates, access/windows, history, trips and issues |
| GET | `/api/dispatcher/planning-context` | Eligible unassigned demand, fleet, trips and reference constraints |
| GET | `/api/dispatcher/trips` and `/api/dispatcher/trips/:id` | Persisted trip facts and recorded stop sequence |
| GET | `/api/dispatcher/exceptions` and `/api/dispatcher/exceptions/:id` | Scoped issue facts, safe notes, provenance and related quantities |

Lists default to 25 records and cap page size at 100. Pulse totals and Planning demand totals aggregate all matching records; their previews are bounded and labelled. Planning context previews cap orders/deferred review at 100 each, vehicles at 200 and trips at 50; generation reads the full authoritative eligible backlog. Operational order date means the active trip's service day, otherwise the initial eligible delivery date (requested date fallback). Orders can explicitly filter originally requested dates instead. Planning requires an actual operating calendar row. Deferred records appear separately in the read context; the M5 engine uses retained deferral history in its documented prioritization policy.

The Milestone 4 judge retains its independently prepared read scenarios. Fleet capacities describe master records; planning requires explicit daily availability and known weekly fuel rather than inferring readiness from those capacities. Routes show recorded stop sequence and planned/actual timestamps without simulated tracking or invented coordinates. Exception Centre remains read-only because resolution business rules are undefined. Proof exposes metadata and saved-evidence flags only; binary storage and access are deferred. Future Capacity has no connected forecast or prediction model.

## Allocation engine and independent judge

Planning Studio generates one depot/day run from persisted eligible demand. Served orders receive real draft trip/stop/allocation records; excess or infeasible demand receives retained deferral evidence. The independent Validate action recomputes complete plan constraints and transitions valid served orders to PLANNED. Release requires the current valid, non-stale version and a confirmation dialog, then commits the run/trips and RELEASED_TO_LOADING order states atomically. Drafts are inspectable by Dispatcher and remain inaccessible to Loader/Driver until release. Loader records actual quantities against the same released stops.

The documented heuristic prioritizes prior deferrals and scarce/tight demand, applies blocking constraints, then selects feasible candidates using explicit lexicographic tie-breakers. Decimal weight and volume limits stay separate. Temperature, access, depot, delivery/mall windows, Fresh before 08:00, two-trip limit, daily availability and weekly fuel are enforced. Depot/district references estimate travel without invented GPS; waits/service/return and a conservative 15-minute turnaround are recorded. The strategy is deterministic, not globally optimal.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/dispatcher/plans?date=&depotId=` | Bounded generated-run history and current active run |
| POST | `/api/dispatcher/plans` | Generate or version-bound supersede/regenerate an unreleased draft |
| GET | `/api/dispatcher/plans/:id` | Scoped decisions, trips, timing, capacities and constraint evidence |
| POST | `/api/dispatcher/plans/:id/validate` | Independent persisted-result checks with optimistic run version |
| POST | `/api/dispatcher/plans/:id/release` | Fresh checks and atomic release of a validated current run |

For a deterministic independently authored excess-demand scenario, keep local PostgreSQL running and use:

```sh
npm run demo:allocation-judge
npm run dev:allocation-judge
```

Open **http://localhost:5176** and choose **2040-03-05**. This separate `/waypoint_allocation_judge` database supplies synthetic demand, explicit availability, known opening/usage fuel, calendar and travel/service facts. It creates no precomputed planning result. Click Generate → inspect served/deferred decisions and Explain My Plan → Validate → Release and confirm. Reload reads the same persisted run. Repeated setup preserves actual orders, generated/released histories and deferrals. Fresh isolated integration databases provide repeatable clean scenarios; setup does not reset the main database or M4 judge.

The preview enables `PLANNING_ALLOW_SYNTHETIC=true` only in its process environment. That flag defaults to false and is forbidden in production, independently of `STORE_ALLOW_SYNTHETIC`. Existing imported fleet records with unknown daily availability or opening fuel remain blocked. No availability/zero fuel history is inferred, and no old allocation CSV or AI/ML service is used. API port 3003 and Vite port 5176 are separate from the main preview; `.env` is preserved. Stop the preview with Ctrl+C; its data remains.

## Docker

After `npm run setup:local`, review `.env` and run:

```sh
docker compose up --build
```

Compose defines PostgreSQL → API → Web health dependencies. API startup automatically applies the committed migration and runs the idempotent user seed. Web is exposed at http://localhost:5173; API and PostgreSQL have no host port mappings. PostgreSQL 18 data is mounted at `/var/lib/postgresql` in a named volume. Do not run Compose and local Vite on the same web port simultaneously.

This local Compose configuration defaults to `NODE_ENV=development` so cookies work over local HTTP. A shared deployment must terminate HTTPS and set `NODE_ENV=production`, `WEB_ORIGIN=https://your-host`, and fresh secrets. Production startup requires HTTPS origin and issues Secure cookies. `API_TRUST_PROXY=true` trusts exactly one proxy hop within the private Compose network; standalone development defaults to false.

Container runtime verification is recorded separately in the Milestone 1 report. A validated YAML file or local PostgreSQL test does not prove a container build/startup passed.

## Remote Docker verification

Local development can run without Docker using `npm run dev:db` and `npm run dev` as described above. Competition startup remains:

```sh
docker compose up --build
```

The [Docker Compose verification workflow](.github/workflows/docker-compose-verification.yml) verifies the same root Compose stack on GitHub Actions `ubuntu-latest`. It runs on pushes, pull requests and manual **Run workflow** requests after the repository is published. It builds the API/Web images, starts PostgreSQL/API/Web and uses [Compose's health wait](https://docs.docker.com/reference/cli/docker/compose/up/) before checking the published Web page and API health over HTTP.

The workflow creates a disposable `.env` from these documented, public CI-only values; no GitHub secrets or competition dataset are required:

| Variable | Non-secret CI value |
| --- | --- |
| `POSTGRES_USER` | `waypoint_ci` |
| `POSTGRES_PASSWORD` | `waypoint-ci-only-db-password` |
| `POSTGRES_DB` | `waypoint_ci` |
| `AUTH_SECRET` | `waypoint-ci-only-auth-secret-not-for-deployment-2026` |
| `SEED_DEMO_PASSWORD` | `WaypointCIOnly!2026` |
| `WEB_ORIGIN` | `http://localhost:5173` |
| `WEB_PORT` | `5173` |
| `SESSION_HOURS` | `1` |
| `NODE_ENV` | `development` |

These credentials belong only to the runner's temporary, loopback-exposed stack. Use fresh private secrets for a shared deployment. Each run uses a unique Compose project name and a fresh database volume. API startup applies all committed migrations and the idempotent auth-only seed. The verifier checks every migration, exactly the four safe demo identities and empty reference, assignment and operational tables. It then signs in as `dispatcher@waypoint.local`, restores the database-backed session with `/api/auth/me`, checks the protected Dispatcher workspace and logs out. An unauthenticated workspace request must return 401.

Private `input resources/`, `private-data/`, prototype files, the local prototype audit containing private identifiers, raw CSVs, dataset ZIPs and local `.env` remain excluded from Git and Docker build contexts. Installation uses only application files, committed migrations and publication-safe auth accounts; private imports and judge fixtures are not run. The workflow collects Compose logs on failure and always runs `docker compose down -v --remove-orphans` to remove its containers and volume.

For an already running Docker stack, an optional smoke check is available:

```sh
npm run verify:docker
```

This command checks HTTP, seeded authentication and session/logout behavior without resetting data. CI additionally uses `--installation` to verify a fresh database. This script is not required for normal local development. An existing volume retains its original seeded passwords, so the configured `SEED_DEMO_PASSWORD` must match that installation.

**Docker runtime status remains UNVERIFIED until this GitHub Actions workflow finishes successfully.** Preparing files or passing local source checks does not establish Docker PASS. If Git is not initialized, these files are preparation only; initialize/publish the repository yourself when ready, then inspect the workflow run in GitHub's Actions tab.

## API foundation

| Method | Endpoint | Access |
| --- | --- | --- |
| GET | `/api/health` | Public database readiness; 503 if unavailable |
| POST | `/api/auth/login` | Validated credentials; rate limited |
| POST | `/api/auth/logout` | Revokes current session; idempotent |
| GET | `/api/auth/me` | Authenticated user, safe fields only |
| GET | `/api/workspaces/dispatcher` | Dispatcher only |
| GET | `/api/workspaces/loader` | Loader only |
| GET | `/api/workspaces/driver` | Driver only |
| GET | `/api/workspaces/store` | Store Manager only |
| GET | `/api/domain/outlets/:id` | Store outlet or Dispatcher/Loader depot scope |
| GET | `/api/domain/orders/:id` | Assigned outlet/depot or released assigned trip scope |
| GET | `/api/domain/trips/:id` | Dispatcher depot; Loader released depot trip; Driver assigned released trip |

All mutations reject unapproved browser origins. Sessions expire after `SESSION_HOURS` (default 8), active users are rechecked, logout invalidates server state, and authentication/domain responses disable caching. No bearer credential is stored in localStorage. API errors omit stack traces, password hashes and session tokens. Domain GETs return safe DTOs; Store mutations added in Milestone 3 use the same authentication, origin and lifecycle guards.

## Verification commands

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:safety
```

`npm run test` initializes a fresh isolated loopback PostgreSQL cluster, migrates/seeds twice, and runs Vitest/Supertest against real Prisma. Separate databases verify Milestone 1 auth preservation, Milestone 2 quantity/date preservation during upgrade, Store scenarios and Dispatcher scenarios independently of the original domain suite. The runner disables synthetic eligibility unless a test explicitly opts in, irrespective of local demo settings. Tests do not reset the development database; clusters stop and temporary files are removed. No database-dependent tests are silently skipped.

Tests cover all seeded logins, bad/unknown credentials, unauthenticated requests, the complete role/resource access matrix, role injection, invalid JSON, origin checks, logout replay, expiration, deactivated users, and hash storage. Test TypeScript is included in typecheck.

The 30 domain tests additionally cover atomic reference imports, constraints, valid/invalid/unauthorized lifecycle transitions, concurrent versions, audit rollback/history, four independent quantities, actionable discrepancies, depot/trip/outlet scope, trip limits, repeated deferrals and unknown fuel history. Synthetic fixtures are independently authored and used only in isolated tests. Prepared related records in tests do not imply an implemented operational workflow or allocator. Safety checks scan private exclusions, dataset markers and 180 locally available official identifiers against frontend/shared/seed/build content.

`deepmerge-ts` is overridden to patched 8.x for Prisma's CLI dependency tree; migration/generation and integration checks must remain part of future dependency upgrades. See the [dependency advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

## Foundation review walkthrough

1. Open the login page and choose a demo email.
2. Enter the configured password; verify the assigned role home.
3. Open every item in that role's menu. Store and Dispatcher show their scoped persisted workflows after explicit assignment; Loader shows the persisted dock/checklist/shortfall/readiness workflow; Driver retains foundation states.
4. Refresh a protected URL; the server session restores the same identity.
5. Try a different role's URL; verify access denied and return to the assigned workspace.
6. Sign out; revisiting a protected URL must return to login.
7. Repeat with all four accounts. Review Dispatcher at 1440px, Loader at 390/768px, Driver at 360/390px, and Store at 390/768px.
8. At phone widths, open the menu to reach all role screens, use the bottom navigation, and test Escape/Tab/focus behavior.

## Designathon fidelity and limitations

The shell keeps the logo, light canvas, charcoal sidebar, lime accents, system typography, rounded cards, compact role navigation, and phone bottom-navigation concept. Text sizing and focus/touch targets are made readable. Login is a new screen required for real authentication. The prototype's experience selector is replaced by server-owned role identity.

Store has real persisted counts, forms, tracking and receipt actions. Dispatcher preserves the prototype's card hierarchy, compact table/inspector, three-area Planning Studio and issue/trip compositions while showing real scoped facts. Planning Studio generates, independently validates and releases persisted plans with constraint evidence. Loader preserves dock cards, planned sequence, quantity checklist, shortfall dialog and dispatch readiness; Driver retains foundation states. No screen claims simulated telemetry, scanner operations or offline queues. No prepared allocation fixture is treated as generated output.

Milestone 5 — Allocation Engine passed local acceptance: 224 tests, required typecheck/lint/build/safety checks, the synthetic Generate → Validate → Release browser journey and responsive review. Exact evidence and remaining limits are recorded in the allocation report. Milestone 6 — Loader passed local acceptance: 246 tests including all 224 earlier cases, required checks and the browser 192 → 188 approval/readiness journey at 360/390/768px. See [the Loader report](docs/milestone-6-loader.md). Deployment and container runtime acceptance remain separate from local acceptance. A physical mobile onscreen keyboard has not been tested.

## Loader workflow and local judge

Loader reads UserDepot scope from the session and shows only released generated plans for the selected day. Normal counts persist; lower counts require a reason and Dispatcher approval. Original ordered quantities remain intact. Ready for Dispatch checks every stop and blocking exception transactionally; departure belongs to Milestone 7.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/loader/loads?date=` | Released generated trips in assigned depots/day |
| GET | `/api/loader/trips/:id` | Actual sequence and quantities/readiness |
| POST | `/api/loader/stops/:id/load` | Versioned normal count or shortfall |
| POST | `/api/loader/trips/:id/ready` | Guarded persistent readiness |
| POST | `/api/dispatcher/exceptions/:id/review-load` | Scoped approve/reject decision |

Keep local PostgreSQL running, stop other app previews, then run `npm run demo:loader-judge` and `npm run dev:loader-judge`. Open **http://localhost:5177**; API port 3004. The separate `waypoint_loader_judge` leaves .env and main/M4/M5 data intact. Setup installs independent SYNTHETIC demand/references and controlled Loader/Dispatcher UserDepot assignments, with no precomputed Loader trip. Repeat setup preserves history.

Dispatcher selects **2040-03-05**, Generates, Validates and Releases. Loader opens **SYN-PLAN-LOADER-AMBIENT · Trip 1**, records normal stops and reports **SYN-LOADER-LOADER-ORDER-192: 192 expected → 188 actual / STOCK_UNAVAILABLE**. Dispatcher approves in Exception Centre; Loader completes the other stops and marks Ready. Use one active localhost preview because cookies share the hostname.

