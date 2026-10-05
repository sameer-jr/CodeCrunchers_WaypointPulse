# Waypoint Pulse — six-minute Hackathon demo script

Target 6:00; allowed recording length 5–8 minutes. This prepares a team recording; no video has been recorded or linked. Show the current product and cite exact release evidence in [competition review readiness](competition-review-readiness.md) and [photo/signature/maps verification](media-maps-verification.md). The earlier [final Hackathon verification](final-hackathon-verification.md) remains historical.

## Prepare before recording

Use the verified [Railway application](https://web-production-87afe.up.railway.app). All four public judge accounts use `WaypointJudge!2026`.

| Judge role | Account |
| --- | --- |
| Dispatcher | dispatcher@waypoint.local |
| Loader | loader@waypoint.local |
| Driver | driver@waypoint.local |
| Store Manager | store@waypoint.local |

The role-home review guide separates three registered SYNTHETIC days:

- **2040-03-12:** prepared execution — **DEMO-REVIEW-AMBIENT-192** awaits Loader; a separate CHILLED/FROZEN Driver route has **25 + 25** units ready.
- **2040-03-13:** **DEMO-PLAN-AMBIENT-100** for fresh Dispatcher planning.
- **2040-03-05:** completed proof/receipt examples — **25 / 25 / 25 / 25** with photo/signature and **192 / 188 / 188 / 188** with a loading shortfall.

Check the readiness report's actual status and UI first. Public reviewers may already have progressed these records. Recording changes demonstration state; repeat startup does not reset it. For a fully repeatable recording, use a separate fresh safe installation rather than deleting live history. The separate local `npm run demo:driver-judge`, `npm run build`, `npm run preview:driver-judge` workflow still uses **2040-03-05**, localhost:5178 and the example local password `WaypointDemo!2026`; keep its day/order references separate from public preparation.

Use one origin and explicit sign-out/sign-in at handoffs. Retain the same actual order/trip IDs through each execution handoff. DevTools must interrupt real requests for the offline segment. Wait for **Offline**, save, reload offline, reconnect and wait for acknowledged synchronization. Pending/failed/conflicted Driver work blocks logout. Keep private CSVs, cookies, configuration and infrastructure secrets off screen. Use explicitly synthetic recipient names/proof images. Physical camera/touch/GPS acceptance is separate.

## Recording sequence

1. **0:00–0:30 — Problem and guide.** Show the role-aware application. Say: “Waypoint Pulse keeps planning, loading, delivery and Store receipt on audited shared records. Original quantities survive shortages and offline delivery.” State that public data is independently authored SYNTHETIC data. Show the three-day guide, separating completed evidence from untouched work.

2. **0:30–1:20 — Fresh planning.** As Dispatcher, open Planning Studio, select **2040-03-13** and the assigned synthetic depot. Generate the actual plan for **DEMO-PLAN-AMBIENT-100**. Inspect decisions and Explain My Plan; run independent Validate, then Release if this recording progresses the plan. Say: “The deterministic engine uses stored constraints; a separate validator rechecks the full result before release. Neither calls an AI service.” This planning example is separate from March 12 execution.

3. **1:20–2:15 — Loader shortage.** As Loader, select **2040-03-12**, open **SYN-PLAN-DRIVER-AMBIENT** and **DEMO-REVIEW-AMBIENT-192**. Report Shortfall with **188** actually loaded, **Stock unavailable** and a useful synthetic note. Show Awaiting Dispatcher approval and retained original 192. Say: “Loading records the actual amount. The trip stays blocked until Dispatcher reviews the revised manifest.” If already used, choose an untouched separate fixture or show retained history honestly.

4. **2:15–2:50 — Approval and readiness.** As Dispatcher, inspect that same 192/188 exception and approve. As Loader, confirm approval and Mark Ready for Dispatch. As Dispatcher, assign `driver@waypoint.local` to the ambient trip before departure. Keep its actual ID; the separate ready cold route has a different quantity chain.

5. **2:50–4:20 — Driver offline proof.** As Driver, select March 12 and that ambient trip. Show Route cached and Offline reload ready; Start Trip online. Switch network to Offline and wait for the label. Record arrival; save Delivered **188**, **SYNTHETIC Receiver**, **Receiving staff**, a synthetic note, an optional safe JPEG/PNG and a drawn signature using **Use signature**. Show the actual pending operations/local media label, avoiding a fixed count if an earlier action synchronized. Reload offline and inspect retained previews. Reconnect, wait for SYNCED acknowledgment and show server proof after refresh. Complete remaining stops, if any, then Finish Trip. Say: “The same UUID and evidence survive reload. Replay cannot duplicate delivery; a conflict remains visible. Completion does not invent a depot-return time.” A shorter Driver-only alternate uses the separately ready cold route's two 25-unit stops; keep its own quantities/IDs throughout.

6. **4:20–4:55 — Explicit Store receipt.** With pending count zero and network restored, sign in as Store. Track **DEMO-REVIEW-AMBIENT-192**: **192 ordered / 188 loaded / 188 delivered / received not recorded**, plus synced proof. Explicitly confirm **188** received in good condition; reload. As Dispatcher inspect that same **192 / 188 / 188 / 188** chain. Say: “Driver delivery does not confirm a Store receipt. Store records what it actually received.” The cold alternate uses a 25-unit order/receipt consistently.

7. **4:55–5:30 — Maps and architecture.** Open a route map with a recorded synthetic coordinate and attribution. Dashed sequence lines are not road directions or an ETA. Share location is optional: assigned in-transit trip, HTTPS/localhost and browser permission; claim a real position only after receiving it. The earlier laptop provider returned unavailable while delivery remained usable. Briefly show the retained March 5 photo/signature/receipt, labelled completed history. Show [architecture](architecture.md): React/Vite → same-origin API → PostgreSQL/Prisma; audit transactions and scoped IndexedDB UUID queue. There are **ten additive migrations and 30 models**. The prior media release passed **351 tests**; the readiness report owns this preparation's current count/status.

8. **5:30–6:00 — Docker evidence and close.** Show the published commit's actual successful Ubuntu Docker run from the readiness report: Web/API/PostgreSQL, ten migrations, health, safe seeded login, native photo/signature normalization and always-run cleanup. Claim Docker PASS only after a successful run. Show live/repository links; add a real video URL after recording/upload. State remaining limits: no continuous background tracking, turn-by-turn routing, scanner hardware, reefer telemetry or Datathon predictions. Physical mobile camera/finger signature/GPS/onscreen keyboard remain separate acceptance work.

## Before submitting the recording

Check origin, role, day, actual order/trip IDs, quantities, real offline interruption/reload, acknowledged server proof, explicit Store receipt and final Dispatcher reconciliation. Label completed history honestly. Distinguish March 13 planning from March 12 execution. The readiness report owns exact commit, quality counts, Docker/host results and prepared states; earlier reports remain historical. Replace the missing video placeholder only with a real accessible recording URL.
