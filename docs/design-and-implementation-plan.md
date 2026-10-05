# Waypoint Pulse: design reference and implementation checklist

Status: Milestones 0–8 and the frozen final integration completed their recorded acceptance. Later photo/signature/maps acceptance is documented in [media/maps verification](media-maps-verification.md). The current release uses normal Asia/Colombo dates, explicit safe starter references and four role accounts, with no preloaded operational test history; users create every order. Current source, Docker, Railway and cleanup evidence is in [production starter readiness](production-starter-readiness.md). The demo video is not recorded yet. No new product milestone, redesign or Datathon work is started.

## Design contract

Use `input resources/prototype/index.html` with `styles.css` followed by `apple-premium.css` as the visual baseline. The second stylesheet materially overrides the first. Match the effective rendered design rather than copying the first token block alone.

| Element | Reference | Implementation decision |
| --- | --- | --- |
| Canvas | Final background `#f5f5f7` | Keep the light workspace throughout all roles |
| Surfaces | White/translucent white, fine borders, subtle shadows | Reuse surface hierarchy; provide opaque fallback where needed |
| Text | `#1d1d1f`; secondary `#6e6e73` | Keep near-black hierarchy; validate readable contrast and sizing |
| Accent | Final accent `#b8f238`; existing lime family | Use one consolidated lime token; retain green/blue/amber/red semantic statuses |
| Navigation | Charcoal desktop sidebar, 256px final width, logo, active lime marker | Preserve identity and role navigation order |
| Typography | System sans stack, bold tightly spaced headings | Preserve hierarchy; increase tiny operational labels where usability requires it |
| Shape | Main cards around 24px, secondary elements around 16px, buttons around 12px | Extract shared radius tokens and keep the existing silhouette |
| Actions | Near-black primary button with white label; light secondary | Preserve contrast and visual action priority |
| Media | Existing PNG logos, vehicle photography with local SVG fallbacks | Preserve logo; keep fleet imagery illustrative and avoid treating generic photos as proof |
| Motion | Small hover/focus/entry transitions, reduced-motion overrides | Keep feedback subtle; avoid rendering essential information invisibly during long entry effects |

The charcoal sidebar, fleet card, and driver hero are intentional existing elements within the light product. Preserve these reference elements without expanding them into an overall dark dashboard.

### Layout and navigation fidelity

- **Dispatcher:** preserve Pulse, Orders, Planning, Routes / Trips, Exceptions, Future Capacity. Pulse keeps metrics above fleet/network/readiness/attention panels. Orders retains the list/table plus selected-order inspector. Planning retains orders on the left, trips/map in the centre, and Explain My Plan on the right, stacked on narrow screens.
- **Loader:** preserve Today's Loads, Load Detail, Exceptions. Retain dock cards and manifest table, trip/vehicle identity, stop sequence, quantity checklist, shortfall dialog, and dispatch readiness. Scanner/LIFO/pre-cooling/seal controls must either record real scoped state or clearly describe their limited demo/manual capability.
- **Driver:** preserve Today, Route, Proof, Offline / Sync. Keep the phone-first single column and fixed bottom navigation. Route/stop information remains available during offline operation; outcome, quantity, recipient, evidence, and sync status form one coherent completion flow.
- **Store Manager:** preserve Home, Place Order, Track Delivery, Confirm Receipt. Keep the order summary, timeline, quantity comparison, evidence panel, and discrepancy inputs.
- Preserve the existing logo, terminology, role relationships, and selection context. Replace fixture-loading actions with Generate, Validate, and Release behavior required by the brief; document material departures in the final README.
- At phone widths, use cards in place of wide tables and preserve accessible navigation to all views. Test Loader and Driver at 360px and 390px, tablet at 768px, and Dispatcher at desktop widths. Leave space for the fixed navigation and onscreen keyboard.
- Every operational screen needs loading, empty, error, success, disabled, and pending states. Pair status colors with text. Use visible focus, correctly associated labels, keyboard-operable dialogs, and usable touch targets.
- Future Capacity retains its honest no-predictions state. No ML or fabricated forecast outputs.

## Short implementation plan

1. Establish a TypeScript monorepo and authenticated API/database foundation alongside the preserved prototype reference.
2. Model orders and their transitions centrally, then implement Store creation/tracking and Dispatcher planning using shared state.
3. Build deterministic allocation and independent validation with stored candidate checks, rejection explanations, and deferral history.
4. Connect Loader actual quantities/shortfalls, Dispatcher revision decisions, Driver delivery/proof, and Store receipts using transactions and audit events.
5. Implement real Driver PWA caching, IndexedDB queueing, idempotent synchronization, cross-role freshness and a connected acceptance journey on a separate safe installation.
6. Verify functionality and visual fidelity at each milestone, then complete Docker startup, competition documentation, and deployment packaging.

## Planned technical structure

Use the workspace root as the monorepo root; avoid an unnecessary nested checkout. Use npm workspaces with `apps/web`, `apps/api`, `packages/shared`, `prisma`, `scripts`, and `docs`.

- Web: React, TypeScript, Vite, React Router, TanStack Query, Zod, React Hook Form, Tailwind, accessible primitives, PWA support.
- API: Node/TypeScript and Express or Fastify; Zod input validation; centralized authorization and domain services.
- Persistence: PostgreSQL and Prisma; constraints, migrations, transaction boundaries, audit events, and versioned operations.
- Freshness: query invalidation plus bounded polling initially. An offline client must never imply server synchronization has completed.
- Verification: Vitest domain tests, API integration tests, and browser judge-journey/responsive tests. Root scripts expose typecheck, lint, test, and build.
- Configuration: environment variables, `.env.example`, Docker Compose with database health checks and automatic migration/seed. No committed secrets.

Milestones 1–6 implement the authentication/domain foundation, Store/Dispatcher workflows, deterministic Planning Studio and Loader quantities/review/readiness. Combined M7+8 adds phone-first assigned Driver execution, recipient metadata proof, the static-shell service worker, scoped IndexedDB route cache and durable UUID operation queue. Server and cached facts remain distinct from pending local work; ordered synchronization, replay idempotency and conflicts are explicit. [The combined report](milestone-7-8-driver-offline.md) records local acceptance evidence and deferred work.

## Data and state decisions

- Import official files from an ignored private directory with validated field mappings, unique references, explicit units, and meaningful errors. Use supplied records where available; do not fabricate missing source fields.
- Separate safe installation fixtures from confidential raw and derived competition data. Keep the supplied reference prototype local unless its publication is authorized. Select publication-safe seed records independently of the full fixture.
- Milestone 2 found and imported the official calendar from the private supplied ZIP. Synthetic test calendars remain explicitly labelled fixtures and cannot establish official eligibility by default.
- Maintain a fuel ledger; quotas alone cannot establish remaining weekly fuel. Define and document week boundaries in Asia/Colombo.
- Keep depot in travel-data lookup keys; the prototype's district-only lookup is insufficient for a multi-depot network.
- Store planned departure, per-stop arrival, service duration, return/next-trip feasibility, and route-distance assumptions. Handle opening time, closing time, Fresh deadlines, mall windows, two-trip limit, weight, volume, access, depot, temperature including frozen, availability, fuel, and operating day.
- Preserve original quantities, actual load, actual delivery, and actual receipt separately. Revision requires review before departure. Partial/failed deliveries and receipt discrepancies create distinct states and exceptions.
- Scope Dispatcher and Loader by assigned depots, Driver by assigned trip, and Store by outlet; enforce scope on reads and mutations. Roles and assignments come from the authenticated user and persisted mappings, never a frontend request field. Dispatcher multi-depot reads default to all assigned depots; an explicit unassigned depot is rejected, and foreign direct objects return the same not-found response as missing objects.
- Preserve the original requested date independently from the eligible date. Dispatcher operational-date queries use the active trip service date first, then the eligible date for unassigned orders. Requested-date filtering is a separate explicit view. Carry the selected date and filters in the URL across Dispatcher navigation.
- The Milestone 4 context remains a bounded read view of eligible orders, deferred history and master references. Milestone 5 generation reads the full authoritative eligible backlog and requires explicit day-specific availability and known weekly opening/usage fuel facts for feasible candidates. Vehicle master status alone cannot establish availability. Missing or nonoperating calendars cannot establish planning eligibility.
- Show persisted route/stop sequences and planned versus actual timestamps. The later maps follow-up adds explicitly recorded outlet coordinates and opt-in Driver position reports; it never invents locations or promises continuous tracking, road directions or GPS-derived ETA. With no recorded location, retain honest district/stop context. Exception Centre derives scope through every stored relationship; M6 adds loading-shortfall approve/reject review. General exception resolution and execution-stage replanning remain outside the accepted scope.
- Assign each offline mutation a UUID, full timestamp, entity/action/payload, base version, and sync state. Persist server idempotency results and distinguish replay from conflict; do not clear failed queue items.

## Ordered milestone checklist

Milestones 0–8 passed local acceptance. The table preserves each milestone's historical test count and limitations; it does not report a fresh run against today's source. Combined M7+8 added actual offline/reconnect/conflict and cross-role browser evidence. [Frozen final integration](final-hackathon-verification.md) verified its 308-test, nine-migration release and connected public HTTPS receipt journey. Later feature and normal-starter releases have their own evidence in the reports linked above. Each milestone requires appropriate source checks and browser evidence; confidential reference data must remain excluded from publication. The video remains unrecorded.

| Milestone | Checklist | Acceptance evidence |
| --- | --- | --- |
| 0: Audit | [x] Inventory, source/design/data review, gap analysis, design reference, implementation checklist | Audit document, syntax/reference checks, 17 rendered screens |
| 1: Foundation | [x] Workspaces, web shell, API, PostgreSQL/Prisma, environment, Docker configuration, auth, four users, safe seed | All four login/role redirects, 17 screens and required widths verified; 16 PostgreSQL-backed tests and build pass; Docker runtime not tested |
| 2: Domain | [x] Normalized schema, private reference import, central state machine, timestamps, audit, scope, fuel/history | 46 real PostgreSQL-backed tests; fresh and M1 upgrade preservation; official import/repeat verified; safety/build pass |
| 3: Store | [x] Scoped persisted home/order creation, cutoff/eligibility, real tracking/deferrals, transactional receipts/issues | 102 real PostgreSQL tests including prior 46; browser creation/reload, receipt/issues and 390/768/desktop; prepared cross-role domain records remain explicit fixtures |
| 4: Dispatcher | [x] Scoped Pulse, Orders filters/search/pagination, read-only Planning Studio, persisted Routes / Trips and Exception Centre, honest Future Capacity | 134 real PostgreSQL tests including all 102 prior tests; M1/M2 upgrade preservation; actual browser Store order and receipt-exception handoffs; all six views at 1280px/390px and 1440px fidelity; detailed evidence and limits in the Dispatcher report |
| 5: Allocation | [x] Deterministic checks, priority heuristic, independent validator, candidate explanations, deferrals, versioned regeneration and release | 224 tests including prior 134; seven-migration preservation; synthetic browser generation/validation/release/reload; 120-outlet/60-vehicle benchmark and responsive evidence; Docker runtime unverified |
| 6: Loader | [x] Released generated trips, scoped checklist, persisted quantities, shortfall, Dispatcher approve/reject and readiness | 246 tests including prior 224; real browser 192 → 188 approval/readiness/reload, 360/390/768px, eight migrations and required checks pass; Docker unverified |
| 7: Driver | [x] Assigned ready routes, start/arrival/outcomes, revised quantities, recipient metadata proof and finish | Required checks, all 246 earlier tests plus Driver/client regressions; real generated trip 192 → 188 → 188, partial/failed guards, four-stop finish and same-record Store/Dispatcher browser evidence |
| 8: Offline | [x] Production shell SW, per-user IndexedDB cache/UUID queue, reconnect/retry/idempotency/conflicts | Real browser network-offline arrival/delivery, offline reload, ordered reconnect, synced proof and retained two-tab conflict; PostgreSQL reconciliation and logout race regressions in combined report |
| 9: Receipt | [ ] Further receipt integration scope not separately started | Existing M3 receipt services and explicit receipt ownership were verified during final integration. Binary photo/signature storage was added in the later media follow-up; no automatic receipt was introduced |
| 10: Integration | [x] Approved frozen final integration verification of existing features | Actual generated plan → Loader → Driver offline/reload/sync → explicit Store receipt → final Dispatcher passed on HTTPS. Nine-migration exact-source Docker passed. No new feature or general exception resolution added |
| 11: Quality | [ ] Domain/API/browser tests, mobile/tablet/desktop review, accessibility, error states, performance | Required constraints, permission failures, sync replay/conflicts, and responsive journey pass |
| 12: Packaging | [ ] Submission video still outstanding | Compose startup, README, architecture/ER diagrams, AI disclosure, publication safety and deployment have recorded acceptance. Current installation has safe references/accounts and user-created orders, without preloaded judge object IDs |

### Historical approved final integration verification

- [x] Typecheck, lint, build, safety and diff checks; **308/308 tests in 12 files**.
- [x] All nine migrations and original-fact retention; exact frozen-source Docker installation/auth/health/cleanup.
- [x] Public HTTPS Web with private API/PostgreSQL; four role login/scope/logout checks.
- [x] Actual Generate/Validate/Release, loading shortfall/approval/readiness and assigned Driver start.
- [x] Actual network-offline arrival/delivery, durable offline reload, ordered reconnect and server proof.
- [x] Completed four-stop trip; explicit Store receipt and same-record final Dispatcher facts **192/188/188/188**.
- [x] Fresh history/private-data safety scan and deployment documentation.
- [x] Final staged-index audit completed for the frozen integration; subsequent publication/run evidence belongs to its exact release and the current starter report.
- [ ] Team demo video: **not recorded yet**; six-minute script ready.

## Required regression cases

- Chilled/frozen rejected by ambient; chilled accepted by reefer; van-only rejected by truck; depot mismatch rejected.
- Weight and volume limits independently enforced; third trip rejected; fuel quota exceeded rejected; invalid arrival/window and operating day rejected.
- No feasible candidate produces stored deferral reasons; repeated deferral remains visible; explanations reproduce checks.
- Order creation → generation → validation → publication → load → shortfall → approved revision → delivery → receipt closes one connected order.
- Driver cannot access Dispatcher endpoints; Store cannot publish; users cannot read or mutate another outlet/driver/depot assignment.
- Offline operation replay does not duplicate delivery; retry sends once; version conflict returns understandable state without dropping local work.

## Remaining inputs and verification constraints

The historical Milestone 0 inventory found no separate official calendar/raw CSVs, historical fuel context or location files. During Milestone 1 the user reorganized references into `input resources/` and supplied a private dataset ZIP. Milestone 2 inspected its five official reference CSVs and imported them privately with provenance. No verified addresses/GPS or historical fuel opening balances were supplied. Precomputed allocations and Datathon data are not used as generated planning/ML output. The prototype remains unchanged and private. Recorded Docker and deployment runs are tied to their tested release; future revisions require appropriate verification.

Milestone 3 verified that the supplied private official calendar ends on 2026-06-28; official future ordering requires a refreshed verified calendar. The current public installation instead uses explicit `STARTER_REFERENCE_DATA=true`, `PUBLIC_JUDGE_DEMO=false`, safe SYNTHETIC references and the normal clock, with no seeded orders or fixed demonstration date. Private official records are not published or relabelled. Historical public judging used the separate default-off `PUBLIC_JUDGE_DEMO` mode; that earlier deployment configuration has been superseded. Physical mobile keyboard/GPS reception remains unverified. Current container and deployment acceptance is recorded in the starter report; older milestone limits describe their historical checks.

Milestone 4 retains separate PostgreSQL read fixtures and its independently authored 2040-02-06 judge. Prepared plans/trips remain distinct from allocator output. Its Store/Dispatcher same-record handoffs, 134 tests and required checks passed; that report records historical evidence. M6 and combined M7+8 instead consume actual generated/released plans through Loader and Driver. The independent Driver judge prepares SYNTHETIC demand/references and assignments, never fake trips/deliveries. The generated cross-role/offline acceptance passed, including offline reload/reconnect and a separate retained stale-version conflict.

Combined verification preserved all 246 earlier tests, ran the five required commands, and proved online cache → actual browser network-offline arrival/delivery → offline reload → ordered reconnect synchronization on the same generated trip. Store showed 192 ordered / 188 loaded / 188 delivered separately, with no automatic receipt. Replay and read-only reconciliation showed no duplicate delivery/audit; a two-tab stale-route conflict visibly retained local work. Driver was reviewed at 360/390px. Finish means all stops terminal with Trip.completedAt; actualReturn stays null. The combined report owns final counts, screenshots, browser result and remaining risks.
