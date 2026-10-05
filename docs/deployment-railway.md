# Railway deployment

Use the `CodeCrunchers-WaypointPulse` project with three services in one Railway environment: managed PostgreSQL, `api`, and `web`. Both application services build the same repository commit with the repository root as their build context. Generate a public HTTPS domain for Web only. Keep API and PostgreSQL private.

## Service configuration

| Service | Build/runtime setting | Value |
| --- | --- | --- |
| API | `RAILWAY_DOCKERFILE_PATH` | `apps/api/Dockerfile` |
| API | Health check | `/api/health` |
| API | `NODE_ENV` | `production` |
| API | `API_HOST` | `::` |
| API | `API_PORT` | `3001` |
| API | `API_TRUST_PROXY` | `true` |
| API | `DATABASE_URL` | Reference the managed PostgreSQL private connection variable |
| API | `AUTH_SECRET` | Fresh cryptographically random deployment secret, at least 32 characters |
| API | `SEED_DEMO_PASSWORD` | Configured starter-account password, separate from CI credentials |
| API | `WEB_ORIGIN` | Exact generated Web HTTPS origin, without a path |
| API | `PUBLIC_JUDGE_DEMO` | `false` for normal production operation |
| API | `STARTER_REFERENCE_DATA` | `true` for publication-safe reference-only startup |
| Web | `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile` |
| Web | Health check | `/api/health` |
| Web | `PORT` | `80`; set the generated domain target port to `80` |
| Web | `API_UPSTREAM` | `http://api.railway.internal:3001` |

Retain the managed database's persistent volume and backup configuration. Do not configure public API or database domains/TCP proxies. The API image runs migrations, safe account initialization and the explicitly selected starter reference installer before starting the server; private networking is available at runtime, so these operations stay out of image build. Starter mode supplies independently authored reference records and role scope, **without seeding any orders or operational results**. Users create all demand through normal Store actions. It remains separate from private reference import and legacy development/judge fixtures.

Remove `DISPATCHER_DEMO_DATE` from normal starter configuration. `STARTER_REFERENCE_DATA=true` rejects that fixed-date setting and cannot be combined with `PUBLIC_JUDGE_DEMO=true`. The application uses the current Asia/Colombo clock, persisted current-date reference facts and ordinary calendar/cutoff rules. There is no competition-demo panel or review-day override. Startup is idempotent and preserves later user work; it never clears operational history.

The Web image renders its Nginx configuration on container startup. Its runtime DNS resolver comes from the container's `/etc/resolv.conf`; upstream names are resolved per request with a short cache, including IPv6-only private networks. `PORT` defaults to `80` and `API_UPSTREAM` defaults to `http://api:3001` for Docker Compose. No private address is compiled into the browser bundle. Railway terminates public HTTPS; Nginx preserves the edge's HTTP/HTTPS forwarding header and sends `/api/` requests to the private API. Production cookies are Secure, HttpOnly, SameSite=Strict and scoped to `/api` on the Web origin.

The same Nginx configuration preserves SPA deep-link refresh, the content security policy and static PWA assets. The service worker caches the application shell only; authenticated API responses are excluded. Driver route/proof operations stay in the per-user IndexedDB cache and queue.

## Photo, signature and map update

This follow-up requires migration `20261004000900_delivery_media_location` and matching API/Web source. It adds DeliveryAttachment, OutletLocation and TripPosition; fresh startup applies ten migrations. Image bytes are stored in the existing managed PostgreSQL database, so no external bucket, image-host credential or public upload directory is required. Retain the database volume and include attachment bytes/OfflineOperation payloads in backups. Media growth consumes database storage; a volume backup configuration alone does not establish a successful restore test.

The API image includes Sharp for bounded image validation/re-encoding. Nginx allows a 5 MiB request body and the authenticated Driver completion/sync endpoints allow 5 MiB JSON; ordinary JSON endpoints keep the 16 KiB limit. Three 1 MiB photos and a 256 KiB signature fit the bounded single-operation media payload. Do not lower a proxy/body limit below this payload without matching client limits. Proof reads remain authenticated, same-origin, private and `no-store`; do not put them behind a public asset cache.

Web's CSP permits image requests to `https://tile.openstreetmap.org`; its referrer policy sends only the HTTPS application origin on cross-origin requests. Tiles load only when the user opens the map and are excluded from service-worker precaching. The external service is not an application health dependency. No map API key is required by the current Leaflet/OSM integration. Follow the [tile service policy](https://operations.osmfoundation.org/policies/tiles/); a guaranteed or offline map service would require a provider that permits it and a corresponding source/CSP change.

Driver positioning requires browser permission and the generated Web HTTPS origin. It is optional, foreground-only, connected-only and restricted to the assigned in-transit trip. Do not infer coordinates from reference names or initialize them in seed scripts. Missing coordinates, denied location permission and unavailable tiles must keep delivery/proof usable.

The **historical** photo/signature/maps update passed [Linux Docker run 37266088689](https://github.com/sameer-jr/CodeCrunchers_WaypointPulse/actions/runs/37266088689) on commit `3f204e45559fd9a72e19586dbe9809afb73743a2`, including native image normalization and always-run cleanup. Its Railway API deployment `af4965bb-3d7a-4c2a-b05d-4a7f8cae7ecd` and Web deployment `23845a8c-d42b-426f-af08-60447653b9d2` succeeded on that commit with ten migrations and database-connected health. Those results do not establish the current normal-starter release or cleanup.

The earlier production smoke exercised four roles, a synthetic 50-unit trip, offline media synchronization, scoped galleries and an explicit 25-unit Store receipt. That completed-example approach was superseded by the user's request to clear all testing history and start normal operation with zero orders. Its factual evidence remains in [media/maps verification](media-maps-verification.md); example identities are not promised to remain live after cleanup. The approved laptop GPS provider was unavailable, so real GPS reception and physical phone acceptance remain unverified. **Current source checks, private backup/restore/cleanup, exact Docker run and matching live starter acceptance are pending** in [production starter readiness](production-starter-readiness.md).

## Deployment and acceptance

1. Connect both application services to the final repository commit. Set each Dockerfile path before building; keep the source root at the repository root so shared workspaces and build scripts are available.
2. Generate the Web HTTPS domain, configure API `WEB_ORIGIN` to that origin, and provide the fresh secrets privately through Railway variables. Do not put infrastructure credentials in Git or reuse the workflow's disposable credentials.
3. Deploy API and wait for database-connected health. Confirm ten migrations, four role accounts and only the safe starter references/scope. Deploy Web and require its proxied `/api/health` check to pass. Neither startup nor flag changes remove existing test records: the requested cleanup is a separate guarded operator action after a private backup and verified restore, as recorded in the starter readiness report.
4. After verified cleanup, test all four HTTPS logins, session refresh/logout, wrong-role denial and SPA route refresh. Inspect ordinary navigation, current Asia/Colombo date behavior and usable scope. Confirm **zero orders and prior operational results**, with no competition-demo panel or preloaded plan/ready trip.
5. Verify the full Store-created demand → Dispatcher planning/release → Loader readiness → Driver proof/offline sync → explicit Store receipt journey on a separate safe installation using the same source/starter mode. Check server media scoping, idempotence, retained conflicts, image `no-store` and the service worker's static-shell cache. Keep the public zero-order starting state available for users.
6. On that separate active assigned trip, explicitly opt in to location sharing, verify an actual received reading/accuracy if the provider works, then stop. Check denied/unavailable-provider behavior, historical labels, Store stop scope and missing-coordinate/tile failure fallback. Simulated GPS or browser source checks do not establish physical phone acceptance.
7. Record exact source/CI/deployment IDs, HTTPS/database health, private backup/restore/cleanup evidence and four-role live empty-state checks in `production-starter-readiness.md`. Preserve earlier milestone/media/final reports as historical evidence. Container CI and local workflow success remain separate from deployed acceptance; do not claim either before it actually succeeds.

Railway's [private networking documentation](https://docs.railway.com/networking/private-networking) describes service DNS within an environment. Its [network architecture reference](https://docs.railway.com/networking/private-networking/how-it-works) documents IPv4/IPv6 addressing and runtime-only availability. The [Dockerfile guide](https://docs.railway.com/builds/dockerfiles) documents `RAILWAY_DOCKERFILE_PATH`. Nginx's [official image entrypoint](https://github.com/nginx/docker-nginx/tree/master/entrypoint) provides startup template substitution.
