# Documentation

Waypoint Pulse connects Store Manager → Dispatcher → Loader → Driver → Store Manager. The public Railway installation uses safe starter accounts/reference records, current Asia/Colombo dates and ordinary workflows. Users create all orders; no prepared route or completed proof is supplied.

## Current guides

| Document | Purpose |
| --- | --- |
| [Project README](../README.md) | Live application, role accounts, workflow, Docker and local setup |
| [Production starter readiness](production-starter-readiness.md) | Dated release, verified backup/reset, fresh starting inventory and four-role acceptance |
| [Railway deployment](deployment-railway.md) | Public Web, private API/PostgreSQL, production configuration and release checks |
| [Remote Docker verification](remote-docker-verification.md) | Linux CI, safe installation seed and verification scope |
| [Architecture](architecture.md) | Components, authorization, domain services, offline queue and operating modes |
| [Data model](data-model.md) | Models, constraints, state/quantity separation and reference provenance |
| [Recording script](demo-script.md) | Record a newly created order through the ordinary workflow on a separate safe installation |
| [AI disclosure](AI_DISCLOSURE.md) | AI assistance, deterministic planning and verification limits |
| [Screenshot index](screenshots/README.md) | Six starter captures and separately labeled historical feature evidence |

The October 5, 2026 zero-order inventory is a verified starting snapshot. Later user actions persist. Authentication-only installation is the default in `.env.example`; enable `STARTER_REFERENCE_DATA=true` for safe references and role scope, keeping `PUBLIC_JUDGE_DEMO=false` and omitting `DISPATCHER_DEMO_DATE`.

## Historical design and milestone evidence

These documents record the scope and results of their original milestones. Their synthetic orders, fixed dates, screenshots, test totals and release IDs are historical evidence. They do not describe the present live inventory or instruct operators to recreate test data there.

| Document | Original scope |
| --- | --- |
| [Design and implementation plan](design-and-implementation-plan.md) | Approved product design and milestone sequence |
| [Milestone 1](milestone-1-foundation.md) | Foundation, authentication and application shell |
| [Milestone 2](milestone-2-domain.md) | Domain model, references, scope and state transitions |
| [Milestone 3](milestone-3-store.md) | Store ordering, tracking and explicit receipt |
| [Milestone 4](milestone-4-dispatcher.md) | Dispatcher visibility and role handoffs |
| [Milestone 5](milestone-5-allocation.md) | Deterministic allocation, explanation and independent validation |
| [Milestone 6](milestone-6-loader.md) | Loading quantities, shortfall review and readiness |
| [Milestones 7 + 8](milestone-7-8-driver-offline.md) | Driver execution, durable offline queue and reconnect synchronization |
| [Final Hackathon verification](final-hackathon-verification.md) | Earlier production workflow and offline acceptance |
| [Media/maps verification](media-maps-verification.md) | Accepted optional photos/signature/maps feature release and its limits |
| [Prepared review scenario](competition-review-readiness.md) | Earlier preloaded scenario, removed by the later starter reset |

## Evidence boundaries

Local PostgreSQL tests, Linux container verification, live HTTP checks and browser acceptance are separate evidence. A healthy deployment does not prove every physical-device behavior or maintain an empty database after users begin working.

Real GPS reception and physical phone camera/finger-signature/keyboard acceptance remain unverified. No public demo video has been recorded. These gaps are documented without fabricated results or links. Original confidential competition files, private prototype source, credentials and maintenance backups remain excluded from publication.
