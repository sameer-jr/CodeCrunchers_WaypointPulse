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
| API | `SEED_DEMO_PASSWORD` | Configured final judge password, separate from CI credentials |
| API | `WEB_ORIGIN` | Exact generated Web HTTPS origin, without a path |
| API | `PUBLIC_JUDGE_DEMO` | `true` for the independently authored public judge scenario |
| Web | `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile` |
| Web | Health check | `/api/health` |
| Web | `PORT` | `80`; set the generated domain target port to `80` |
| Web | `API_UPSTREAM` | `http://api.railway.internal:3001` |

Retain the managed database's persistent volume and backup configuration. Do not configure public API or database domains/TCP proxies. The API image runs migrations and safe account initialization before starting the server; private networking is available at runtime, so these operations stay out of the image build. The explicit public judge option initializes publication-safe synthetic records without importing any confidential competition rows. It must remain separate from private reference import and the development fixture opt-in flags.

The Web image renders its Nginx configuration on container startup. Its runtime DNS resolver comes from the container's `/etc/resolv.conf`; upstream names are resolved per request with a short cache, including IPv6-only private networks. `PORT` defaults to `80` and `API_UPSTREAM` defaults to `http://api:3001` for Docker Compose. No private address is compiled into the browser bundle. Railway terminates public HTTPS; Nginx preserves the edge's HTTP/HTTPS forwarding header and sends `/api/` requests to the private API. Production cookies are Secure, HttpOnly, SameSite=Strict and scoped to `/api` on the Web origin.

The same Nginx configuration preserves SPA deep-link refresh, the content security policy and static PWA assets. The service worker caches the application shell only; authenticated API responses are excluded. Driver route/proof operations stay in the per-user IndexedDB cache and queue.

## Photo, signature and map update

This follow-up requires migration `20261004000900_delivery_media_location` and matching API/Web source. It adds DeliveryAttachment, OutletLocation and TripPosition; fresh startup applies ten migrations. Image bytes are stored in the existing managed PostgreSQL database, so no external bucket, image-host credential or public upload directory is required. Retain the database volume and include attachment bytes/OfflineOperation payloads in backups. Media growth consumes database storage; a volume backup configuration alone does not establish a successful restore test.

The API image includes Sharp for bounded image validation/re-encoding. Nginx allows a 5 MiB request body and the authenticated Driver completion/sync endpoints allow 5 MiB JSON; ordinary JSON endpoints keep the 16 KiB limit. Three 1 MiB photos and a 256 KiB signature fit the bounded single-operation media payload. Do not lower a proxy/body limit below this payload without matching client limits. Proof reads remain authenticated, same-origin, private and `no-store`; do not put them behind a public asset cache.

Web's CSP permits image requests to `https://tile.openstreetmap.org`; its referrer policy sends only the HTTPS application origin on cross-origin requests. Tiles load only when the user opens the map and are excluded from service-worker precaching. The external service is not an application health dependency. No map API key is required by the current Leaflet/OSM integration. Follow the [tile service policy](https://operations.osmfoundation.org/policies/tiles/); a guaranteed or offline map service would require a provider that permits it and a corresponding source/CSP change.

Driver positioning requires browser permission and the generated Web HTTPS origin. It is optional, foreground-only, connected-only and restricted to the assigned in-transit trip. Do not infer coordinates from reference names or initialize them in seed scripts. Missing coordinates, denied location permission and unavailable tiles must keep delivery/proof usable.

The previous release's Railway and Docker PASS evidence does not verify this update. Current exact-commit CI, deployment and production media/offline/location acceptance are **pending** in [media and maps verification](media-maps-verification.md). Preserve existing production delivery/receipt history during rollout; use a separate safe synthetic review scenario for new write acceptance.

## Deployment and acceptance

1. Connect both application services to the final repository commit. Set each Dockerfile path before building; keep the source root at the repository root so shared workspaces and build scripts are available.
2. Generate the Web HTTPS domain, configure API `WEB_ORIGIN` to that origin, and provide the fresh secrets privately through Railway variables. Do not put infrastructure credentials in Git or reuse the workflow's disposable credentials.
3. Deploy API and wait for its database-connected health check. Confirm ten migrations finish successfully and four judge accounts plus the explicit synthetic scenario are initialized. Deploy Web and require its proxied `/api/health` check to pass.
4. Test all four logins at the actual HTTPS URL, session refresh, logout, wrong-role denial and SPA route refresh. Use the current README judge walkthrough across planning, loading review, Driver execution and Store receipt.
5. While Driver is online, confirm the production service worker is registered and its assigned route is cached. Capture a safe demo photo/signature, go offline, record arrival/delivery, reload offline, reconnect and sync. Confirm attachments become authorized server proof in Driver/Store/Dispatcher, retry creates no duplicate attachments, Store receipt remains separate and conflicts retain local evidence. Check unauthorized image/location reads and image `no-store` responses.
6. Explicitly opt in to Driver location sharing on an active safe demo trip, verify a received reading and accuracy, then stop sharing. Verify denial/no-permission behavior, historical labels, Store stop scope and missing-coordinate/tile failure behavior. Do not use simulated GPS evidence as physical-device acceptance.
7. Record the deployed commit, real HTTPS URL, health results, four-role/media smoke and deployed offline/location results in `media-maps-verification.md`. Preserve `final-hackathon-verification.md` as historical release evidence. Container CI and local offline success do not establish deployed acceptance.

Railway's [private networking documentation](https://docs.railway.com/networking/private-networking) describes service DNS within an environment. Its [network architecture reference](https://docs.railway.com/networking/private-networking/how-it-works) documents IPv4/IPv6 addressing and runtime-only availability. The [Dockerfile guide](https://docs.railway.com/builds/dockerfiles) documents `RAILWAY_DOCKERFILE_PATH`. Nginx's [official image entrypoint](https://github.com/nginx/docker-nginx/tree/master/entrypoint) provides startup template substitution.
