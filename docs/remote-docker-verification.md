# Remote Docker verification

Local development can run without Docker. Competition startup remains `docker compose up --build`; GitHub Actions verifies the same root container stack on Linux. The latest recorded successful run is dated **5 October 2026**; later commits require their own workflow result.

| Evidence | Recorded result |
| --- | --- |
| Repository | [sameer-jr/CodeCrunchers_WaypointPulse](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse) |
| Workflow | [docker-compose-verification.yml](../.github/workflows/docker-compose-verification.yml) |
| Runner | `ubuntu-latest` |
| Source commit | `4dde53baa84c97ca82e980b2d2ff82cbc68e80a9` |
| Docker run | [37338059525 — success](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/runs/37338059525) |
| Verification job | `111857766942` — success |
| Migrations | All **ten** committed migrations applied |
| Installation data | Four role accounts only; no reference, assignment or operational data |
| Image processing | Synthetic photo/signature normalization passed without application writes |
| Cleanup | `docker compose down -v --remove-orphans` succeeded |

## Workflow behavior

The workflow checks out the repository without retaining checkout credentials and writes a disposable `.env` from documented non-secret CI values. It validates Compose configuration, runs `docker compose build`, then `docker compose up -d --wait --wait-timeout 180`. `docker compose ps -a` runs even on failure. PostgreSQL, API and Web must become healthy; API/PostgreSQL stay internal and Web is exposed at loopback port 5173.

HTTP checks require Web HTML and database-connected `/api/health`. [The verifier](../scripts/verify-docker.mjs) checks that every committed migration is applied and that only the four safe role accounts exist. It also decodes/re-encodes small independently generated image bytes through the native Sharp runtime without writing proof or operational records.

The verifier signs in as `dispatcher@waypoint.local`, restores the same database-backed session through `/api/auth/me`, accesses the protected Dispatcher workspace and logs out. An unauthenticated workspace request must return 401. “Seed accounts” means initial role logins; this CI verification neither seeds orders nor performs a business workflow.

Failure-only collection retains `docker compose logs --no-color --timestamps`. The unconditional cleanup step removes CI containers, network and volume. In the recorded successful run, failure logs were correctly skipped and cleanup passed.

## Non-secret CI environment

These intentionally disposable values are stored in the workflow and must not be reused for production:

| Variable | CI value |
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

Both `STARTER_REFERENCE_DATA` and `PUBLIC_JUDGE_DEMO` remain false through Compose defaults, making this a fresh auth-only installation check. For usable normal starter workflows, explicitly set starter true / judge false and omit `DISPATCHER_DEMO_DATE` as described in [Installation with Docker](../README.md#installation-with-docker). That optional mode adds safe references/scope, **no orders or operational results**, and preserves later user work. The `--installation` verifier intentionally asserts the auth-only CI state and is not intended for a populated starter/business database.

After a local Docker stack is healthy, the optional `npm run verify:docker` checks image processing, HTTP, seeded authentication, protected access and logout. It does not initialize/reset the database and is not required for normal local development. `--installation` is used only by CI on its fresh auth-only volume.

## Publication safety and verification boundaries

No confidential competition dataset is required. `.gitignore` and `.dockerignore` exclude private resources, raw competition CSV/ZIP files, the original confidential prototype, `.env`, local databases/backups and maintenance credentials. Published screenshot evidence uses safe starter references or explicitly labelled historical synthetic scenarios. [Private-data safety checking](../scripts/check-safety.mjs) is separate from successful container execution.

This run establishes installation, ten migrations, native image processing and database-backed authentication at the recorded source. It does not establish the full four-role business workflow, production TLS/GPS, physical phone acceptance or a successful backup restore. Those require their own evidence in [production starter readiness](production-starter-readiness.md).

The original **4 October 2026** baseline ([run 37189530460](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/runs/37189530460), commit `05e8eb1b19b5a14538b37f2f615f3eba8c034a8c`, job `111398633060`) passed with eight migrations before Driver/media features. It remains historical evidence and does not establish acceptance of later source.
