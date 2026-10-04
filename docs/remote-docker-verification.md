# Remote Docker verification

Verified on **4 October 2026** using the published repository's root Compose stack on GitHub Actions `ubuntu-latest`.

- Repository: [sameer-jr/CodeCrunchers_WaypointPulse](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse)
- Workflow: `.github/workflows/docker-compose-verification.yml`
- Source commit: `05e8eb1b19b5a14538b37f2f615f3eba8c034a8c`
- [Successful workflow run 37189530460](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/runs/37189530460)
- Run conclusion: **success**; verification job `111398633060` completed successfully.

## Confirmed results

The workflow checked out the repository, created the documented non-secret CI environment, ran `docker compose build`, then ran `docker compose up -d --wait --wait-timeout 180`. The status output showed PostgreSQL, API and Web healthy; API and PostgreSQL remained internal, and Web was exposed on loopback port 5173.

The published Web endpoint served HTML over HTTP, and API health confirmed a connected database. The fresh database contained all **eight committed migrations**, exactly **four publication-safe auth accounts**, and no reference, assignment or operational data.

The verifier signed in as the seeded Dispatcher, restored the same identity from its database-backed session, accessed the protected Dispatcher workspace and logged out. An unauthenticated workspace request returned 401. These results establish installation and authentication behavior without importing any competition dataset.

The unconditional `docker compose down -v --remove-orphans` step passed. Logs confirm removal of all three containers, the CI network and the PostgreSQL volume. Failure-log collection was correctly skipped because the run succeeded.

## Publication safety and boundaries

Before publication, the staged snapshot contained 225 files; all 169 text files were checked against 180 locally available private identifiers, configured local secrets and credential/private-key patterns. An independent review found copied private references in the original local prototype audit; that report was excluded from both Git and Docker. Private resources, raw CSVs/ZIPs, `.env`, local databases and the original prototype remain excluded. Published screenshot evidence uses safe demo or independently authored synthetic scenarios.

Application functionality was unchanged for this task. The existing Loader preview was not stopped or reconfigured. Local development still works without Docker; competition startup remains `docker compose up --build`.

This result verifies the Docker installation stack, migrations, safe seed and authentication for the recorded source commit. It does not establish production deployment, competition-dataset acceptance or a later product milestone. Application/container changes require a fresh successful workflow run.
