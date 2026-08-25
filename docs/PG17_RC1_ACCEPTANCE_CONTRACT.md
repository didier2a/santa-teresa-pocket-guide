# PocketGuide 1.7 RC1 — Real-time Audiovisual Guide Acceptance Contract

Status: normative acceptance contract for the PocketGuide 1.7 RC1 branch. PocketGuide 1.7 MUST remain a separate entry point and MUST NOT replace PocketGuide 1.6 until every automated, simulated and field gate below is green.

## Product invariant
PocketGuide 1.7 preserves every PocketGuide 1.6 G0–G15 guarantee. It adds a deterministic walking guidance layer that synchronizes real GPS movement, RoutePack progress, visual media and short spoken cues. PocketGuide Core remains the source of truth; the AI may explain and converse, but it never invents position, direction, arrival, geometry or execution success.

## Preserved foundation — G0 to G15
- The full `PG16_RC1_ACCEPTANCE_CONTRACT.md` remains normative.
- PocketGuide 1.6 remains available unchanged at `pocketguide-16.html`.
- PocketGuide 1.7 is exposed only at `pocketguide-17.html` until explicit promotion.
- The 1.5.2 Premium shell, Human Guide, RoutePack, Planner, memory, Geo-AR, offline behavior and confirmation rules remain intact.

## G16 — Version and state isolation
- PocketGuide 1.7 has a distinct HTML entry point, application version, persistent state key and service-worker cache.
- Opening or simulating PocketGuide 1.7 cannot overwrite PocketGuide 1.6 route progress.
- V1.7 may reuse V1.6 modules only through backward-compatible extension points.

## G17 — Deterministic walking state machine
- Guidance phases are explicit: `waiting_gps`, `gps_degraded`, `en_route`, `preview`, `approaching`, `arrived`, `departed` and `completed`.
- Phase changes are derived from RoutePack coordinates, GPS accuracy, distance, heading and stable sample counts.
- A single noisy GPS sample cannot confirm an arrival.
- The same state machine processes real and simulated positions.

## G18 — Movement-driven route progression
- Arrival requires consecutive reliable samples inside the configured arrival zone.
- The current event is completed only after a confirmed arrival followed by a real departure from its exit zone.
- Automatic progress uses the existing `route.next` Action Registry path.
- Structural route replacement, shortening and skipping retain the V1.6 confirmation rules.
- Events sharing the same physical place are never silently consumed solely from identical coordinates.

## G19 — Audiovisual synchronization
- The active photograph, place name, distance, direction instruction, progress and spoken cue describe the same current RoutePack event.
- Leaving an arrived place promotes the next event and its image together.
- Media transitions use a readable cross-fade and respect `prefers-reduced-motion`.
- The next useful image is prefetched without blocking GPS guidance.
- Missing media degrades to the Premium visual fallback without blocking navigation.

## G20 — Spoken guidance policy
- Automatic speech is short while walking and more descriptive at confirmed arrival.
- Deterministic navigation cues are generated locally from trusted route and sensor data.
- Historical narration uses RoutePack content and cited source metadata only.
- Repeated GPS samples do not repeat the same cue.
- The user can mute, repeat and interrupt automatic speech at any time.
- Realtime/OpenAI unavailability does not disable local audiovisual guidance.

## G21 — Visual walking interface
- The main Premium hero exposes phase, instruction, target distance, direction and route progress at a glance.
- Touch targets remain at least 44 px where possible.
- The interface remains usable in portrait and landscape on Galaxy S22.
- Camera/Geo-AR stays optional and is never opened automatically while walking.
- Walking guidance remains readable with the camera closed.

## G22 — Safety, truth and degraded modes
- GPS accuracy above the configured threshold suppresses precise arrival and direction claims.
- Missing heading produces distance guidance without a fabricated turn instruction.
- Offline mode preserves the RoutePack, local media, progress and deterministic cues.
- The guide does not claim turn-by-turn street routing when the RoutePack contains only point coordinates.
- The screen advises the user to look at the environment and not continuously at the phone.

## G23 — Deterministic walking simulation
The exact V1.7 application and state machine must simulate:

1. launch at the first place;
2. two-sample stable arrival confirmation;
3. no arrival from one noisy sample;
4. departure from an arrived place;
5. automatic advance through `route.next`;
6. image change synchronized with the new target;
7. preview-zone cue;
8. approach-zone cue;
9. arrival historical cue;
10. cue deduplication;
11. GPS accuracy degradation and recovery;
12. heading unavailable without invented direction;
13. left, right, straight and turn-around instructions;
14. pause and resume of simulated walking;
15. manual single-step simulation;
16. consecutive events at the same physical place;
17. final route completion after departure;
18. offline walking continuity;
19. OpenAI unavailable while local voice remains available;
20. camera denied while visual route guidance remains available;
21. app close/reopen with audiovisual state reconstructed;
22. mute, repeat and interrupt controls;
23. reduced-motion rendering contract;
24. preservation of all V1.6 G14 scenarios.

## G24 — Release and field gate
Before publication of PocketGuide 1.7 RC1, all must be green:

- JavaScript syntax checks;
- complete existing repository regression suite;
- PocketGuide 1.6 G0–G15 suites;
- PocketGuide 1.7 contract suite;
- walking state-machine unit suite;
- complete deterministic walking simulation suite;
- mobile Premium shell checks;
- RoutePack validation tests;
- service-worker/PWA isolation and offline tests;
- browser verification of the real V1.7 page and simulated walk.

After automated publication, the final release gate is a real Galaxy S22 walk. The field report must explicitly distinguish real GPS, real heading, actual media changes, actual spoken cues and any simulated fallback.
