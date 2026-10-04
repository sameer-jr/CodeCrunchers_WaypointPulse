# Waypoint Pulse

Team Code Crunchers · Tech-Triathlon 2026

| Submission resource | Current state |
| --- | --- |
| Repository | [CodeCrunchers Waypoint Pulse](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse) |
| Live Application | No verified public deployment is available for this revision. |
| Demo Video | No demo video has been provided. The [six-minute recording script](docs/demo-script.md) is ready for team use. |
| Docker Verification | Current-source verification is pending in the [Docker Compose workflow](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/workflows/docker-compose-verification.yml). A successful run for the final commit is required. |

Waypoint Pulse is a responsive delivery-operations platform for the fictional **Waypoint Group**, connecting **Store Manager → Dispatcher → Loader → Driver → Store Manager** through shared persisted operational state.

> **One order. One system. Four perspectives.**

## Competition and problem context

- **Event:** Tech-Triathlon 2026
- **Team:** Code Crunchers
- **Phase:** Hackathon
- **Repository:** CodeCrunchers_WaypointPulse

The competition scenario describes a shared distribution network with 120 outlets, two depots and a mixed vehicle fleet serving three brands:

| Brand | Goods |
| --- | --- |
| Waypoint Fresh | Groceries, chilled and frozen goods |
| Waypoint Style | Garments and cartons |
| Waypoint Tech | Appliances and consumer electronics |

Waypoint Pulse is designed to replace fragmented spreadsheet, phone-call and paper coordination with constraint-aware planning, explainable decisions, loading feedback, delivery records and explicit receipt confirmation. Capacity, transport temperature, outlet access, receiving windows, Fresh morning deadlines, weekly fuel, the two-trip limit, shortages and unreliable field connectivity form one connected workflow. These describe the competition problem; the reproducible judge uses separately authored SYNTHETIC data.

## Current scope

The implemented workflow connects Store orders, Dispatcher Generate / independent Validate / Release, Loader quantities and shortfall review, Ready for Dispatch, assigned Driver execution, real offline delivery/reconnect sync, Store receipt and Dispatcher operational reads. Combined Milestones 7+8 passed local acceptance; Driver, IndexedDB queue, production service-worker shell, idempotent sync and visible retained conflicts are implemented. The current full suite passed **308/308 tests in 12 files**, retaining all 299 accepted baseline tests and adding nine production configuration/public-judge regressions. There are **nine migrations and 27 Prisma models**. See [the Driver/offline report](docs/milestone-7-8-driver-offline.md) for accepted milestone evidence and [final Hackathon verification](docs/final-hackathon-verification.md) for the final quality gate. Current-source Docker and public deployment acceptance remain pending; no new product feature or Datathon work is included.

The original Designathon prototype remains unchanged under `input resources/prototype/` following the workspace's reference-file reorganization. It is a private local reference and is excluded from Git and Docker. The root application copies only the two brand PNGs. The supplied dataset ZIP is private and is not imported by the auth seed or bundled into the web app.

## Architecture and technology

- npm workspaces; TypeScript; React/Vite; React Router; TanStack Query; Zod; React Hook Form; Tailwind CSS.
- Express API, Zod request validation, centralized authentication/authorization/error handling.
- PostgreSQL with Prisma: 27 normalized models, including User/Session, explicit daily VehicleAvailability and OfflineOperation; transactional services and SQL integrity guards.
- Driver offline: production service worker for the application shell, per-user IndexedDB route cache and durable UUID operation queue.
- Passwords use salted Node scrypt. Random opaque session tokens are issued as HTTP-only, SameSite=Strict cookies. Only an HMAC digest of each token is stored in PostgreSQL. User role and active status are checked on every protected API request.
- Role routes are protected in the client and server; failed cross-role client navigation shows an access-denied page. There is no authenticated role-switch control.
- [Architecture](docs/architecture.md), [data model](docs/data-model.md), [AI disclosure](docs/AI_DISCLOSURE.md).
- [Design reference and implementation checklist](docs/design-and-implementation-plan.md).
- [Six-minute demo script](docs/demo-script.md), [final Hackathon verification](docs/final-hackathon-verification.md).
- [Milestone 1 verification report](docs/milestone-1-foundation.md), including browser evidence and the unverified Docker runtime limitation.
- [Milestone 2 verification report](docs/milestone-2-domain.md), including real database upgrades, private import and 46 automated tests.
- [Milestone 3 Store report](docs/milestone-3-store.md), including scoped creation, cutoff, tracking, receipts, 102 automated tests and browser evidence.
- [Milestone 4 Dispatcher report](docs/milestone-4-dispatcher.md), including date context, depot scope, read-only planning and cross-role verification.
- [Milestone 5 allocation report](docs/milestone-5-allocation.md), including heuristic, constraints, timing/fuel assumptions, independent validation and release verification status.
- [Milestone 6 Loader report](docs/milestone-6-loader.md), including the persisted 192 → 188 approval/readiness cascade.
- [Milestone 7+8 Driver/offline report](docs/milestone-7-8-driver-offline.md), including 192 → 188 → 188, offline reload/reconnect and retained conflict evidence.

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

The official container installation needs Git and Docker Engine/Desktop with Docker Compose. Local development additionally uses Node.js 24 LTS and npm. A PostgreSQL service or Docker is optional for that local path: `dev:db` uses a workspace-local PostgreSQL binary installed through the `embedded-postgres` npm dependency. It does not install a system service or create a system user.

If Windows PowerShell blocks `npm.ps1`, use `npm.cmd` for these commands; no execution-policy change is needed.

On Windows, stop the API before installing dependencies or generating Prisma: the running API locks its native query-engine DLL. Local database start/stop uses PostgreSQL's `pg_ctl` so shutdown waits for its worker processes to finish.

## Official fresh installation

1. Clone the application repository and enter its root:

   ```sh
   git clone https://github.com/sameer-jr/CodeCrunchers_WaypointPulse.git
   cd CodeCrunchers_WaypointPulse
   ```

2. Copy the publication-safe example configuration to an ignored local environment file:

   ```sh
   cp .env.example .env
   ```

   In Windows PowerShell use `Copy-Item .env.example .env`.

3. Edit `.env` before startup. Set a fresh private `POSTGRES_PASSWORD`, a fresh random `AUTH_SECRET` of at least 32 characters, and the intentionally public judging `SEED_DEMO_PASSWORD`. Local judging defaults to `WaypointDemo!2026`. Keep `POSTGRES_USER=waypoint`, `POSTGRES_DB=waypoint`, `WEB_PORT=5173`, `WEB_ORIGIN=http://localhost:5173`, `NODE_ENV=development` and `PUBLIC_JUDGE_DEMO=false` for this auth-only loopback HTTP installation. Compose constructs its own internal `DATABASE_URL`; the example's loopback URL belongs to the separate native-development path. Do not reuse CI or development infrastructure secrets for a public deployment.

4. Build and start the root stack:

   ```sh
   docker compose up --build
   ```

5. In another terminal, wait for PostgreSQL, API and Web to report healthy. Check `docker compose ps`, then open `http://localhost:5173/api/health`: it must return `status: ok` and `database: connected`. Startup applies **all nine committed migrations** and seeds only the four auth accounts. `npm run verify:docker` can check the running installation when Node/npm are installed; it does not reset the database.
6. Open **http://localhost:5173** and sign in with the four judge accounts below. A fresh installation has no operational assignments or private references; empty/denied operational views are expected until an explicit safe judge scenario is prepared. The reproducible local scenario is documented under [Final judge walkthrough](#final-judge-walkthrough).
7. Stop with Ctrl+C or `docker compose down`; the named PostgreSQL volume retains data. Do not use `down -v` on a judge installation whose workflow history must be preserved.

No private ZIP, CSVs, existing `.env`, local database files or prototype source is required to build or install. Synthetic judge preparation is separate from installation seeding.

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

## Judge accounts

All four intentionally public local judge accounts use **`WaypointDemo!2026`** when initialized with the checked-in example configuration. `SEED_DEMO_PASSWORD` is the configured judging password and must be 12–128 characters; if an operator chooses a different public judging password, provide that value to judges separately. Infrastructure passwords and session secrets are never judging credentials. The seed creates missing accounts and preserves existing users, passwords, roles and active status on repeated startup. Changing the seed environment does not rotate existing accounts.

| Email | Role | Home |
| --- | --- | --- |
| dispatcher@waypoint.local | DISPATCHER | `/dispatcher/pulse` |
| loader@waypoint.local | LOADER | `/loader/loads` |
| driver@waypoint.local | DRIVER | `/driver/today` |
| store@waypoint.local | STORE_MANAGER | `/store/home` |

The login demo selector fills the email only. The password is verified by the server. The normal auth-only seed imports no competition data and grants no domain assignments. Without explicit UserOutlet/UserDepot or driver-trip assignments, domain object access defaults to denial. Separately enabled public judge preparation supplies independent SYNTHETIC demand and scope mappings; it never seeds a trip assignment or delivery.

## Private reference import

Place the five official files in ignored `private-data/reference/`: `outlets.csv`, `vehicles.csv`, `calendar.csv`, `district_travel.csv`, `service_allowance.csv`. With the configured database running:

```sh
npm run import:reference -- --source official --dry-run
npm run import:reference -- --source official
```

`--directory` can select another directory within ignored `private-data/` or `input resources/`. Provenance must be explicit; all files are required. The importer validates exact headers, explicit numeric/enum/time/date conversions, positive capacities, duplicate keys and references before an atomic database import. Content digests make repeated imports a no-op. Changed sources that collide with existing keys fail without partial changes; reconciliation is not silently performed. Synthetic imports require explicit labelling and are forbidden in production. Imports do not grant user assignments or create orders, trips or allocations.

The supplied private ZIP contains all five expected reference files. The local import has 120 outlets, 60 vehicles, 910 calendar days, 12 travel rows and 9 service allowances, marked OFFICIAL. These counts describe the private import, not installation seed data. The official calendar ends on **2026-06-28**, so it cannot authorize future orders on the current review date, 2026-10-04. A fresh official calendar is required for current official operation. The Store API blocks dates absent from its eligible calendar. Raw files remain excluded from Git, Docker and web bundles. No source GPS/address fields or verified opening fuel history were supplied. Fuel remaining is unknown until an opening balance is established; quota alone does not imply zero consumption. Business dates/weeks use Asia/Colombo; the fuel week begins Monday.

Deploy the committed migrations rather than `prisma db push`; custom SQL checks, partial indexes and integrity/history triggers are required. Driver delivery proof persists recipient name/role alongside outcome, quantity, note and completion time. Photo/signature capture and binary storage are unavailable; no illustrative image is presented as proof.

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

This explicit local-only command adds an independently authored **SYNTHETIC** Fresh outlet, assigns the Store demo account, and inserts up to 60 future synthetic calendar days without replacing existing official days. Its Monday–Saturday pattern belongs only to this fixture. Set `STORE_ALLOW_SYNTHETIC=true` in ignored local `.env` and restart the API to permit those labelled dates. The flag defaults to false; ordinary production rejects it without the separate explicit public judge mode. The current local preview uses this opt-in. No orders, plans or deliveries are created by this setup command.

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

The Milestone 4 judge retains its independently prepared read scenarios. Fleet capacities describe master records; planning requires explicit daily availability and known weekly fuel rather than inferring readiness from those capacities. Routes show recorded stop sequence and planned/actual timestamps without simulated tracking or invented coordinates. Exception Centre supports the minimal loading-shortfall approval/rejection flow; general issue resolution remains deferred. Proof exposes metadata and saved-evidence flags only; binary storage and access are deferred. Future Capacity has no connected forecast or prediction model.

## Allocation engine and independent judge

Planning Studio generates one depot/day run from persisted eligible demand. Served orders receive real draft trip/stop/allocation records; excess or infeasible demand receives retained deferral evidence. The independent Validate action recomputes complete plan constraints and transitions valid served orders to PLANNED. Release requires the current valid, non-stale version and a confirmation dialog, then commits the run/trips and RELEASED_TO_LOADING order states atomically. Drafts are inspectable by Dispatcher and remain inaccessible to Loader/Driver until release. Loader records actual quantities against the same released stops; Driver access additionally requires assignment and satisfactory ready loading.

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

The preview enables `PLANNING_ALLOW_SYNTHETIC=true` only in its process environment. That flag defaults to false; ordinary production rejects it without the separate explicit public judge mode, independently of `STORE_ALLOW_SYNTHETIC`. Existing imported fleet records with unknown daily availability or opening fuel remain blocked. No availability/zero fuel history is inferred, and no old allocation CSV or AI/ML service is used. API port 3003 and Vite port 5176 are separate from the main preview; `.env` is preserved. Stop the preview with Ctrl+C; its data remains.

## Docker runtime and production configuration

After `npm run setup:local`, review `.env` and run:

```sh
docker compose up --build
```

Compose defines PostgreSQL → API → Web health dependencies. API startup automatically applies the committed migration and runs the idempotent user seed. Web is exposed at http://localhost:5173; API and PostgreSQL have no host port mappings. PostgreSQL 18 data is mounted at `/var/lib/postgresql` in a named volume. Do not run Compose and local Vite on the same web port simultaneously.

This local Compose configuration defaults to `NODE_ENV=development` so cookies work over local HTTP. A shared deployment must terminate HTTPS and set `NODE_ENV=production`, `WEB_ORIGIN=https://your-host`, and fresh secrets. Production startup requires HTTPS origin and issues Secure cookies. `API_TRUST_PROXY=true` trusts exactly one proxy hop within the private Compose network; standalone development defaults to false.

Current-source container acceptance is pending. YAML validation or local PostgreSQL tests do not establish a successful build/startup of the current Driver/offline images and ninth migration. Historical results in the [earlier remote verification report](docs/remote-docker-verification.md) apply only to its recorded pre-Driver commit.

The selected deployment is the **CodeCrunchers-WaypointPulse Railway project**, with a generated HTTPS Web domain and private API/PostgreSQL services; see [Railway deployment instructions](docs/deployment-railway.md). Public hosting requires persistent PostgreSQL, same-origin `/api` forwarding and SPA-route fallback. Set fresh `DATABASE_URL`, `AUTH_SECRET` and infrastructure credentials; set the intentionally public judging `SEED_DEMO_PASSWORD`, the exact HTTPS `WEB_ORIGIN`, and `NODE_ENV=production`. The deployed judging password must differ from development/CI values and is published only after its accounts are configured and verified. Production rejects missing or known CI/template credentials, the old development/CI judging passwords and a non-HTTPS origin. The API issues Secure session cookies. The root Compose Web port binds to loopback, so a public TLS proxy must forward to it when using Compose. No verified public URL or deployed smoke/offline result is currently claimed.

For the standalone publication-safe demonstration, set **`PUBLIC_JUDGE_DEMO=true`** in the API service's Railway variables, or in `.env` for a dedicated Compose demo, before startup. It defaults to false and is the only production authorization for SYNTHETIC eligibility; the local Driver setup helper remains development-only. Keep the production HTTPS origin and fresh private infrastructure credentials, and configure the new intentionally public judging password before its first auth seed. Startup preflights configuration, applies all nine migrations, seeds the four auth accounts, then runs `seed:public-judge`. Before fixture writes, that installer rejects a database containing any OFFICIAL reference/import/calendar/availability/fuel data. It prepares the independent DRIVER scenario, demand and role mappings for **2040-03-05**, with `SYN-LOADER-DRIVER-ORDER-192`; a different configured judge day is rejected. It creates no plan, trip, Driver trip assignment, delivery or receipt. Repeat startup preserves operational history and existing passwords. Use a separate demo database and perform the entire workflow through the UI. With this flag false, fresh installation remains auth-only and the CI installation verifier expects empty reference/operational tables.

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

**Current-source Docker verification: pending.** Only a successful [workflow run](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/workflows/docker-compose-verification.yml) for the final source commit can establish acceptance. Record its exact commit SHA, run URL and result in [final Hackathon verification](docs/final-hackathon-verification.md); an earlier eight-migration result cannot verify this revision.

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
| GET | `/api/domain/orders/:id` | Assigned outlet/depot or Driver's assigned ready generated trip scope |
| GET | `/api/domain/trips/:id` | Dispatcher depot; Loader released depot trip; Driver assigned ready/in-transit/completed generated trip |

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
3. Open every item in that role's menu. Store and Dispatcher show their scoped persisted workflows after explicit assignment; Loader shows its dock/checklist/shortfall/readiness workflow; Driver shows its assigned ready route, arrival/delivery/proof and synchronization state.
4. Refresh a protected URL; the server session restores the same identity.
5. Try a different role's URL; verify access denied and return to the assigned workspace.
6. Sign out; revisiting a protected URL must return to login. Driver sign-out requires connection and no unsynced work, and clears only that user's safe local route/operation cache after successful logout.
7. Repeat with all four accounts. Review Dispatcher at 1440px, Loader at 390/768px, Driver at 360/390px, and Store at 390/768px.
8. At phone widths, open the menu to reach all role screens, use the bottom navigation, and test Escape/Tab/focus behavior.

## Designathon fidelity and significant departures

The shell keeps the logo, light canvas, charcoal sidebar, lime accents, system typography, rounded cards, compact role navigation, and phone bottom-navigation concept. Text sizing and focus/touch targets are made readable. Credential login replaces the prototype's experience selector with server-owned role identity. Stored stop lists replace map imagery where verified coordinates are unavailable. There is no live GPS, turn-by-turn navigation, barcode hardware integration or reefer telemetry. Recipient/outcome/quantity/note/time provide real proof metadata; binary photo/signature capture and cloud storage are unavailable. Future Capacity deliberately has no Datathon predictions.

Store has real persisted counts, forms, tracking and receipt actions. Dispatcher preserves the card hierarchy, compact table/inspector, three-area Planning Studio and issue/trip compositions while showing real scoped facts. Loader retains dock cards, actual stop sequence, quantity checklist, shortfall dialog and dispatch readiness. Driver retains phone-first Today, Route, Proof and Offline / Sync with a vehicle hero, current-stop card, recipient/outcome proof and actual persisted device queue. No screen claims GPS, scanner or temperature telemetry. No prepared allocation fixture is treated as generated output.

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

## Driver and offline workflow

Driver access resolves the current session and `Trip.driverUserId`; the frontend cannot choose an actor or expand assignment scope. Only assigned generated trips with released planning provenance and complete/approved loading are exposed. READY_FOR_DISPATCH trips can start; IN_TRANSIT trips can record their current stop; completed trips retain their delivery history. Draft, unreleased, loading-blocked and foreign trips are excluded.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/driver/routes?date=` | Assigned ready/in-transit/completed generated routes for the selected day |
| GET | `/api/driver/trips/:id` | Actual sequence, loaded quantities, timing, proof and permitted actions |
| POST | `/api/driver/trips/:id/start` | Versioned READY_FOR_DISPATCH → IN_TRANSIT with actual departure |
| POST | `/api/driver/stops/:id/arrival` | Versioned current-stop arrival without GPS verification |
| POST | `/api/driver/stops/:id/complete` | Transactional delivery/outcome/proof, order lifecycle and audit |
| POST | `/api/driver/trips/:id/finish` | All terminal stops → trip COMPLETED; actualReturn remains null |
| POST | `/api/driver/sync` | Sequential UUID operations with idempotent results and retained conflicts |
| GET | `/api/dispatcher/drivers` | Active Driver choices for scoped Dispatcher assignment |
| POST | `/api/dispatcher/trips/:id/driver` | Versioned assignment to a released generated trip before departure |

DELIVERED records the actual loaded amount; PARTIALLY_DELIVERED requires a lower positive quantity and reason; FAILED requires zero delivered and a reason. No delivery may exceed the load or alter ordered/loaded quantities. Successful/partial proof requires recipient name and role. OTHER, damaged-in-transit and quantity-rejected reasons require a useful note. Full delivery reaches AWAITING_RECEIPT; partial/failed outcomes retain their own state and create operational exceptions. Store reads the same DeliveryRecord and still records its receipt separately.

The UI saves each arrival/delivery action durably in IndexedDB before sending it. Operations carry UUID, entity/action/payload, created/client-event timestamps and expected versions. The queue displays PENDING, SYNCING, SYNCED, FAILED and CONFLICT separately; unsynced local projections are visibly labelled. Reconnect attempts ordered synchronization, with manual **Sync now** as fallback. Replays with the same UUID and payload return the saved result without duplicate delivery/audit; changed UUID payloads or stale versions conflict. Failed/conflicted work is retained and is never silently overwritten or deleted.

Production builds precache only the application shell and essential static assets in the service worker. Authenticated API responses are not service-worker cached. Assigned route data and the device queue use per-user IndexedDB; a sanitized Driver identity permits cached-route access on network failure, never after a server 401. Passwords/session tokens/raw datasets are not stored there. Sign-out is blocked while offline or unsynced work exists. Session-generation checks prevent late requests from restoring cleared identity/routes after logout. Device storage remains essential: clearing browser data, private browsing expiry or losing the device can lose unsynchronized work.

The Web build wrapper explicitly sets Vite's NODE_ENV to production even when local `.env` selects development, ensuring the built preview contains the service-worker registration. Direct development mode does not provide offline reload acceptance. Fresh connected queued actions use server event time; offline/delayed actions retain client time with seven-day age, five-minute clock skew and departure/arrival ordering checks. A conflict retains the original proof for review and blocks dependent writes; no automatic conflict-resolution workflow is provided.

## Final judge walkthrough

Keep `npm run dev:db` running and stop other localhost previews, then:

```sh
npm run demo:driver-judge
npm run build
npm run preview:driver-judge
```

Open **http://localhost:5178** (API 3005). The independent `/waypoint_driver_judge` scenario prepares SYNTHETIC demand/references and role mappings for **2040-03-05**, with a 192-unit order. It creates no precomputed trip, plan or delivery; repeated preparation retains actual workflow history and leaves `.env`, main and earlier judge databases intact. `dev:driver-judge` is available for development, but its Vite development server does not establish production service-worker offline acceptance.

Use one active application tab/origin and explicitly sign out between roles. Cookies are shared across localhost ports. Keep the actual generated plan/trip and `SYN-LOADER-DRIVER-ORDER-192` selected throughout. Generated IDs are created by the product; do not replace them with hardcoded records. On a fresh judge database the reference vehicle is **SYN-PLAN-DRIVER-AMBIENT · Trip 1**. Repeat preparation preserves prior progress; a completed/released journey is retained for inspection rather than reset.

1. **Dispatcher** — sign in as `dispatcher@waypoint.local`.
2. Open **Planning Studio** and select **2040-03-05** and the assigned SYNTHETIC depot.
3. Click **Generate Plan**; inspect the actual served decisions and retained deferrals.
4. Open **Explain My Plan** for a served or deferred order and inspect its stored constraints/reasons.
5. Run **Validate** and confirm the independent validation result.
6. Click **Release**, confirm the versioned release dialog, and note the actual trip containing `SYN-LOADER-DRIVER-ORDER-192`.
7. Sign out and sign in as **Loader**, `loader@waypoint.local`.
8. Select the same day in **Today's Loads** and open that released ambient trip.
9. Use **Mark Loaded** for its normal stops, keeping their actual expected quantities.
10. On the 192-unit order choose **Report Shortfall**, enter **188** actual loaded units and choose **Stock unavailable** (`STOCK_UNAVAILABLE`). Add a useful SYNTHETIC shortage note and submit **Report Shortfall**.
11. Confirm the trip says **Awaiting Dispatcher approval**; original ordered quantity remains 192. Sign out.
12. **Dispatcher** — sign in, open **Exception Centre** for the same day, and select the same loading-shortfall record.
13. Inspect **192 expected / 188 loaded**, its reason and the actual generated trip link; approve the revised manifest.
14. Sign out and return as **Loader**. Open the same checklist and confirm **Dispatcher approved this revision**.
15. Complete any remaining normal loads and click **Mark Ready for Dispatch**. Confirm persisted readiness, then sign out.
16. **Dispatcher** — sign in and open the same trip in **Routes / Trips**.
17. Choose `driver@waypoint.local` under **Assign Driver before departure** and click **Assign Driver**. Assignment after readiness is supported; it must precede departure. Sign out.
18. **Driver** — sign in as `driver@waypoint.local`, select the same day and assigned trip, and open **Today** / **Route**.
19. While online, confirm **Route cached on this device** and **Offline reload ready**. The route includes the approved actual 188-unit load.
20. Click **Start Trip** online; confirm IN_TRANSIT and the current first stop.
21. Switch the browser's network control to **Offline**. This must interrupt real requests; the application's indicator alone is not an offline test.
22. In **Route**, record arrival at the current 192-unit order's stop.
23. Open **Proof**; choose **Delivered**, enter **188** delivered units, a SYNTHETIC recipient name, receiving role and a useful note. Save the delivery.
24. Confirm **Saved locally / Pending sync** and two pending arrival/completion operations in **Offline / Sync**.
25. Reload while the browser is still offline. The assigned route, arrival, recipient, note and pending proof must remain.
26. Restore network. Wait for ordered automatic sync or use **Sync now**; confirm those operations are **SYNCED** and the pending count is zero.
27. Reload online and confirm the same recipient/188-unit proof is a synced server record, then advance through remaining stops in sequence.
28. Record each remaining arrival and terminal outcome with actual quantities; a partial delivery requires a lower positive quantity and reason, and a failed delivery requires zero and a reason. Use useful notes for quantity rejection/damage/Other. Successful/partial deliveries require recipient name and role.
29. When all active stops are terminal, click **Finish Trip**; confirm COMPLETED and the persisted stop count. Trip completion records completedAt and leaves actualReturn unrecorded.
30. Confirm no unsynced work remains, then sign out. Driver sign-out is blocked while offline or while pending/failed/conflicted work remains; do not clear browser storage to bypass it.
31. **Store Manager** — sign in as `store@waypoint.local`, open **Track Delivery** and select `SYN-LOADER-DRIVER-ORDER-192`.
32. Verify **192 ordered / 188 loaded / 188 delivered / Store received: Not recorded**, AWAITING_RECEIPT and the same actual recipient/note. No Driver action created a receipt.
33. Open **Confirm Receipt**, enter **188** as **Quantity actually received**, select **Received in good condition**, optionally add a receiving note, and click **Confirm Receipt**.
34. Confirm **Receipt confirmed**, 188 received and RECEIPT_CONFIRMED. Reload to verify persistence; ordered/load/delivery facts remain 192/188/188. Sign out.
35. **Dispatcher** — sign in, reopen the same day/order/trip and verify **192 / 188 / 188 / 188**, RECEIPT_CONFIRMED, completed trip progress and the retained loading-review history. Any partial/failed delivery issues on other stops remain actionable in Exception Centre; a Store receipt does not resolve them.

The current final full suite passed **308/308** in 12 files (258.25 seconds): all 299 accepted baseline cases plus nine production configuration/public-judge regressions. The 299-case milestone baseline already included real offline reload/reconnect and retained stale-version conflict checks. Final receipt/cross-role acceptance, the fresh current-source Docker run and any actual public-host smoke/offline result are recorded separately in [final Hackathon verification](docs/final-hackathon-verification.md). Local offline success does not establish deployed offline success. The authoritative future official competition calendar is unavailable; this deterministic judge deliberately uses independently authored SYNTHETIC data. A physical mobile onscreen keyboard has not been tested.

## Team and competition use

**Code Crunchers · Tech-Triathlon 2026 — Hackathon.** The submitted Designathon experience and project brief remain the product specification; final team review and competition submission decisions belong to Code Crunchers. AI assistance is documented in [the disclosure](docs/AI_DISCLOSURE.md), and no AI service is required by the running application.

This repository was created for the Tech-Triathlon 2026 competition. Competition datasets remain subject to the competition's confidentiality and usage rules and are intentionally not distributed through this repository.

