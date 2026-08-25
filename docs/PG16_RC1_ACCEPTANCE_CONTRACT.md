# PocketGuide 1.6 RC1 — Human Guide Acceptance Contract

Status: normative acceptance contract for the RC1 branch. RC1 MUST NOT be merged to main or exposed as the user test build until every automated and simulated gate below is green.

## Product invariant
PocketGuide 1.6 keeps the proven 1.5.2 Premium UX while replacing the internal orchestration with the Human Guide architecture. The Human Guide owns the experience; PocketGuide Core owns truth, validation and execution.

## G0 — Visual continuity
- Same Premium shell as 1.5.2: terrain hero, voice orb, status chips, context cards, Guide/Map/Route/Create bottom navigation.
- The microphone remains available from every principal view.
- No developer vocabulary in normal UX (PocketGuideState, ActionRegistry, pendingProposal, etc.).
- Simulation, debug and real GPS use the same visual shell; only data providers differ.

## G1 — Single source of truth
- PocketGuideState contains user, session, trip, route, location, perception, device, conversation, preferences, memory, proposals, ui and connectivity state.
- UI, Guide, Route, Map, AR and Planner read/write through state/actions rather than maintaining conflicting truths.

## G2 — Event bus and Action Registry
- All important actions have one registered execution path shared by voice and buttons.
- Safe actions may execute immediately.
- Structural actions declare confirmation policy and undoability.

## G3 — Context bootstrap and restoration
- At application start, restore route, route progress, session/trip memory, preferences, connectivity and last useful context.
- Build a HumanContextSnapshot before the first meaningful Guide response.
- Reopening after an interruption reconstructs current position/time/route delta and resumes naturally.

## G4 — Memory
- Working memory: current/last mentioned place, current topic, last action, pending confirmation.
- Session memory: visited/skipped places, route changes, stories already told, temporary constraints.
- Trip memory: routes/places visited during the trip.
- Preference memory: explicit useful preferences with scope (session/persistent), source and timestamps.
- User can inspect, override and forget stored preferences.

## G5 — Conversational focus
- Resolve follow-ups such as “celui-là”, “celui d’après”, “raconte-moi son histoire”, “remets comme avant”.
- A bare “oui/non” resolves only against a valid pending proposal.

## G6 — Proposal, confirmation, transaction and undo
- Structural route changes never mutate the active route before confirmation.
- Proposal contains before state, proposed state, reason and human summary.
- Confirm => validate => commit.
- Reject => no mutation.
- Failure => rollback.
- “Remets comme avant” restores the previous valid state when the action is undoable.

## G7 — Planner as an internal Human Guide capability
- Create, replace, shorten, extend and replan from current position.
- Planner receives current route, completed/skipped steps, location, time and constraints.
- Returned RoutePack is deterministically validated before proposal.
- Major route replacement requires confirmation.

## G8 — Voice / Human Guide
- Main conversational path is the Human Guide, not a separate Planner voice path.
- Interruptible speech.
- Listening/thinking/speaking/waiting-confirmation states are reflected in the Premium microphone UI.
- Realtime/OpenAI failure degrades gracefully to local route/map/GPS/AR controls.

## G9 — Perception / smartphone body
- GPS, orientation, camera, microphone and connectivity are abstracted as capabilities.
- Permission denial produces truthful degraded behavior.
- No fabricated GPS, heading, sensor state or execution success.
- iOS/Android platform differences are isolated through platform adapters.

## G10 — Geo-AR
- Camera + GPS + heading + RoutePack remain deterministic.
- Human Guide may select/focus AR targets but cannot invent geometry.
- Real and simulated perception providers feed the same Geo-AR engine.

## G11 — Proactive companion
- Event-driven triggers: meaningful POI proximity, route deviation, time pressure, GPS degradation, network transitions and route completion.
- Relevance/cooldown policy prevents chatter.
- Major route adaptations are proposed, never silently committed.

## G12 — Offline and reconnect
- Active RoutePack, progress and required local assets survive offline use and restart.
- Navigation fallback for pocketguide-16.html is explicit in the service worker.
- Reconnect rebuilds conversational context without losing route truth.

## G13 — PWA/cache consistency
- PocketGuide 1.6 has its own cache/app version.
- pocketguide-16.html and all required pg16 modules are part of the required cache set.
- Query modes never route to another UX because of a fallback key.
- Old 1.5.2 caches cannot shadow the RC shell or modules.

## G14 — Simulation matrix
The same RC build must pass deterministic scenarios for:
1. fresh launch with route;
2. launch without route;
3. resume after short interruption;
4. resume after multi-hour interruption;
5. explain current place;
6. open map by voice and by button through the same action;
7. continue to next step;
8. skip step => confirm yes;
9. skip step => confirm no;
10. shorten route because available time changed;
11. replace route via Planner => confirm;
12. reject Planner proposal;
13. undo last structural change;
14. temporary preference (“today only”);
15. persistent preference + inspect + forget;
16. off-route condition;
17. GPS degraded/lost;
18. network offline;
19. network restored;
20. OpenAI unavailable;
21. camera permission denied;
22. microphone interruption/recovery;
23. route completion;
24. app close/reopen with progress preserved.

## G15 — Regression and release gate
Before publication of RC1, all must be green:
- syntax checks;
- existing 1.5.2 regression suite;
- pg16 core suite;
- pg16 Premium UX suite;
- pg16 contract suite;
- pg16 simulation suite;
- RoutePack validator tests;
- service-worker/PWA cache tests.

No RC1 merge/public test link until G0–G15 are green. The first user-facing RC test is the real S22 build; simulation/debug modes remain engineering tools using the exact same shell and application code.