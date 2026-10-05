# Waypoint Pulse — six-minute normal workflow recording

Target 6:00; allowed length 5–8 minutes. No video has been recorded or linked. The current requested system uses safe starter references, ordinary production navigation and the current Asia/Colombo clock. **No orders or completed examples are seeded.** Users create demand and perform every workflow action. Current checks and private maintenance status are in [production starter readiness](production-starter-readiness.md).

## Prepare before recording

Use a separate safe installation following [Installation](../README.md#installation), with `STARTER_REFERENCE_DATA=true` and `PUBLIC_JUDGE_DEMO=false`. This preserves the public starting inventory for reviewers. The example local password is `WaypointDemo!2026`; the [public Railway application](https://web-production-87afe.up.railway.app) uses `WaypointJudge!2026`. Its private restore/reset and all-role empty-state acceptance passed, with the HTTP snapshot recorded at **2026-10-05T15:42:01Z** in the readiness report. Later users create their own persisted work; the remaining publication/access checklist is separate.

| Role | Account |
| --- | --- |
| Store Manager | store@waypoint.local |
| Dispatcher | dispatcher@waypoint.local |
| Loader | loader@waypoint.local |
| Driver | driver@waypoint.local |

Create the recording order through ordinary Place Order. Use the application-confirmed **eligible service date**, which follows the real calendar and 16:00 Asia/Colombo cutoff; no future demonstration date or privileged panel is used. Rehearse when creation/execution are eligible. A 192-unit ambient order and 188-unit shortage below are example inputs entered by the recorder, not seed data or preloaded results.

Keep the same actual order/trip IDs through all handoffs on one origin, using explicit sign-out/sign-in. Interrupt real requests for the offline segment; wait for Offline, save/reload offline, reconnect and await server acknowledgment. Pending/failed/conflicted Driver work blocks logout. Keep private data, cookies, configuration, database backups and infrastructure secrets off screen. Use safe recipient names/proof images and truthful actual quantities.

## Recording sequence

1. **0:00–0:45 — Normal empty state and Store creation.** Show ordinary navigation, with no competition-demo panel or existing order. As Store Manager, choose the assigned outlet, enter a representative **192-unit ambient order** and submit through Place Order. Show its confirmed state and actual eligible date. Say: “Users create demand. The four roles then act on the same persisted order.” Empty Dispatcher/Loader/Driver work before order/planning is correct.

2. **0:45–1:45 — Dispatcher planning.** As Dispatcher, select the new order's eligible date and assigned depot in Planning Studio. Generate the actual plan, inspect constraints and Explain My Plan, independently Validate, then Release. Assign the Driver to the trip containing that order. Retain its actual ID. Say: “Stored constraints drive a deterministic plan; an independent validator rechecks before release. Neither calls an AI service.”

3. **1:45–2:30 — Actual loading and review.** As Loader, open that released trip. For the example order, Report Shortfall with **188** actually loaded, **Stock unavailable** and a useful note. Show Awaiting Dispatcher approval and retained original 192. As Dispatcher inspect that same 192/188 exception and approve. As Loader confirm approval, complete any other trip loads, then Mark Ready for Dispatch. No ready route existed before these actions.

4. **2:30–4:00 — Driver creates proof offline.** As Driver, select the assigned ready trip for its actual operational date. Show Route cached and Offline reload ready; Start Trip online. Switch the network to Offline and wait for the label. Record arrival and Delivered **188**, recipient/receiving role/note plus an optional safe JPEG/PNG and drawn signature committed with **Use signature**. Show actual pending operations and device-saved media. Reload offline to inspect retained previews. Reconnect, await SYNCED and refresh to show acknowledged server proof. Complete remaining stops if present, then Finish Trip. Explain UUID replay cannot duplicate delivery, conflicts remain visible and completion does not invent depot return time. Use the observed pending count rather than assuming two operations.

5. **4:00–4:45 — Explicit Store receipt.** With pending count zero and network restored, as Store track that same order: **192 ordered / 188 loaded / 188 delivered / received not recorded**, plus newly captured proof. Explicitly confirm **188** received in good condition and reload. As Dispatcher inspect the same **192 / 188 / 188 / 188** chain. Say: “Delivery and Store receipt are separate transactions.”

6. **4:45–5:20 — Optional maps and architecture.** Starter records do not invent coordinates/GPS. To show a map, Dispatcher records an explicitly labelled safe example coordinate with a reason, then opens the map with attribution. Sequence lines are not road directions/ETA. GPS sharing requires an active assigned trip, explicit opt-in, permission and a working provider; claim a received position only if one exists. The earlier laptop provider was unavailable. Show [architecture](architecture.md): React/Vite → same-origin API → PostgreSQL/Prisma, audit transactions and scoped IndexedDB UUID queue. There are **ten additive migrations and 30 models**; use the current readiness report's actual test result.

7. **5:20–6:00 — Current release evidence and close.** Show the normal-starter source's actual successful Ubuntu Docker run, matching deployment/health and verified empty starting inventory from the readiness report. A historical run does not establish current PASS. Show real application/repository links; add a video URL only after recording/upload. State remaining limits: no continuous background tracking, turn-by-turn routing, scanner hardware, reefer telemetry or Datathon predictions. Physical phone camera/finger signature/GPS/keyboard remain separate acceptance work.

## Before submitting the recording

Verify ordinary navigation/current-date behavior, no preloaded demand/results, actual created order/trip IDs, role handoffs, quantities, genuine offline save/reload/reconnect, acknowledged server proof and explicit receipt. Recording persists work; refresh/startup never resets it. Do not claim backup restore, production cleanup, current Docker CI or matching deployment passed before actual evidence is recorded. Keep operator maintenance outside product flows. Replace the README video's missing placeholder only with a real accessible URL.
