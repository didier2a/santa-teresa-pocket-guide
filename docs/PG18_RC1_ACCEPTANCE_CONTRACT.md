# PocketGuide 1.8 RC1 — Local Itinerary Library and Audiovisual Travel Journal

Status: normative acceptance contract for PocketGuide 1.8 RC1. PocketGuide 1.8 MUST remain a separate entry point and MUST NOT replace PocketGuide 1.7 until the automated, simulated, browser and Galaxy S22 field gates below are green.

## Product invariant

PocketGuide 1.8 preserves every PocketGuide 1.6 G0–G15 and PocketGuide 1.7 G16–G24 guarantee. It promotes the deterministic walking simulation into a traveller-facing photographic preview, turns the walking companion into a proactive POI-to-POI tourist guide, and adds a local-first itinerary library with geolocated personal media and portable complete backups.

The RoutePack remains the source of truth. Personal photographs never leave the device automatically. PocketGuide never presents generated or unrelated imagery as a real observation of the terrain.

## Preserved foundation

- `PG16_RC1_ACCEPTANCE_CONTRACT.md` and `PG17_RC1_ACCEPTANCE_CONTRACT.md` remain normative.
- PocketGuide 1.6 remains available unchanged at `pocketguide-16.html`.
- PocketGuide 1.7 remains available unchanged at `pocketguide-17.html`.
- PocketGuide 1.8 is exposed only at `pocketguide-18.html` until explicit promotion.
- The Premium mobile shell, Planner, RoutePack validation, Human Guide, walking state machine, Geo-AR, offline behavior, confirmation rules, Waze links and calendar links remain intact.

## G25 — Public photographic route preview

- Every valid active or saved RoutePack exposes a `Simuler ce parcours` action.
- Preview works before arrival and without GPS, camera or microphone permission.
- Preview never mutates real route progress.

## G26 — RoutePack-derived preview scenes

- Scenes follow the exact RoutePack event order.
- Each scene binds one POI, trusted photograph, name, story, previous-leg distance and estimated walking time.
- Missing media uses the Premium fallback and never blocks preview.

## G27 — Synchronized preview playback

- Photograph, place name, map context, progress and spoken narration describe the same scene.
- Playback supports play, pause, previous, next, repeat, mute and exit.
- Reduced-motion mode removes non-essential transitions.

## G28 — Preview modes

- `preparatory` uses trusted route photographs.
- `souvenir` uses personal photographs captured for the itinerary.
- `enriched` combines route and personal photographs in geographic order.
- Empty modes explain why no scene is available and offer a safe alternative.

## G29 — Proactive POI-to-POI tourist guide

- While walking, deterministic movement cues remain short and sensor-derived.
- The guide introduces the next POI during approach and switches to a longer RoutePack tourist story only after stable arrival.
- User questions may interrupt narration; guidance can resume without losing the active POI.

## G30 — Tourist narration truth policy

- Historical narration uses RoutePack fields and source metadata.
- The AI may explain trusted context but cannot invent position, arrival, route geometry, media provenance or capture success.
- Point-to-point guidance never claims street-level turn-by-turn routing.

## G31 — Shared preview and field context

- Preview and real guidance consume the same immutable RoutePack revision.
- A saved itinerary records the exact revision used for preview and the field visit.
- A route revision cannot silently alter an already completed journal.

## G32 — Traveller-facing controls

- The active route exposes `Simuler`, `Démarrer/Reprendre`, `Photographier` and `Mes itinéraires` actions.
- All primary touch targets remain at least 44 px where possible.
- Controls remain usable in portrait and landscape on Galaxy S22.

## G33 — Automatic local itinerary save

- A valid RoutePack is saved automatically after load, confirmed Planner replacement and material route progress.
- Autosave is debounced and failure is visible without blocking guidance.
- Saving one itinerary cannot overwrite an unrelated itinerary.

## G34 — Durable local itinerary record

- Each itinerary has an ID, title, label, status, timestamps, RoutePack revision, progress, cover, POI count and media count.
- Local itinerary data uses IndexedDB, not `localStorage` binary payloads.
- Application state and itinerary media use a V1.8-specific namespace.

## G35 — Itinerary library

- `Mes itinéraires` lists planned, in-progress, completed and archived journeys.
- Cards expose preview, load/resume, export and management actions.
- The list works offline.

## G36 — Reload and resume

- Loading a saved itinerary restores its RoutePack and saved progress exactly.
- Starting from the beginning is an explicit alternative and never an implicit reset.
- Loading emits the same route events consumed by guidance and UI reconstruction.

## G37 — Revisions and duplication

- Material RoutePack replacement increments a revision while preserving creation metadata.
- The user can duplicate an itinerary under a new ID before editing.
- Completed journals remain tied to their captured RoutePack snapshot.

## G38 — Rename, archive and delete

- Rename changes only the user label.
- Archive hides an itinerary from the default active list without deleting it.
- Delete requires explicit confirmation and removes the itinerary plus its local media.

## G39 — Camera capture is user initiated

- Camera capture starts only after the user presses `Photographier` or the existing optional AR control.
- Camera denial or absence never disables GPS guidance, preview, library or import/export.
- No background capture is permitted.

## G40 — Media compression and thumbnails

- Imported/captured images are normalized to a bounded display size and compressed where browser capabilities allow.
- A lightweight thumbnail is stored separately for library and journal rendering.
- Original metadata records source MIME type and resulting sizes.

## G41 — Geolocation metadata

- A capture stores itinerary ID, timestamp, latitude, longitude, accuracy, heading and the active route event when available.
- Missing GPS remains explicit; coordinates are never fabricated or copied from the POI as if measured.
- Location accuracy is displayed with the personal photograph.

## G42 — POI and segment association

- The user can associate a capture with the current POI, next POI or current route segment.
- A suggested association is derived from active route context but remains editable before save.
- Shared-place events retain distinct event IDs.

## G43 — Personal caption and voice note

- A capture accepts an optional text caption and optional locally stored voice-note reference.
- Empty notes are valid.
- Personal notes are never sent to a remote service automatically.

## G44 — Interactive personal photographs

- Opening a personal photograph shows capture time, POI/segment association, measured location and accuracy, caption and source.
- It can focus the associated POI on the route and prepare a contextual guide question.
- Photo pixels are not transmitted to an AI unless a future explicit upload feature obtains separate consent.

## G45 — Audiovisual journal

- Each itinerary builds a chronological journal from RoutePack POIs, walking milestones and personal captures.
- Journal entries preserve official-media versus personal-media provenance.
- The journal can replay locally with deterministic narration.

## G46 — Personal media in later previews

- Saved personal media can be included in `souvenir` and `enriched` preview modes.
- Object URLs used for local blobs are revoked when no longer needed.
- Deleting a media item removes it from later previews and journal playback only after confirmation.

## G47 — Offline local-first behavior

- Itinerary list, saved RoutePacks, progress, personal media, thumbnails, journal and deterministic narration remain usable offline.
- External map tiles or uncached Commons images may degrade visibly without blocking the journal.
- No cloud account or backend is required.

## G48 — Complete portable export

- Export creates one versioned `.pocketguide` file containing manifest, itinerary, RoutePack, progress, journal metadata and personal media bytes.
- Export performs no network request.
- The filename is safe and human-recognizable.

## G49 — Validated import

- Import validates bundle schema, sizes and required RoutePack structure before writing.
- ID collisions create a safe imported copy unless the user explicitly replaces data in a future feature.
- Partial or corrupt bundles leave existing itineraries untouched.

## G50 — Privacy and storage controls

- The UI states that personal photographs remain on the device unless the user exports them.
- Storage usage and quota are reported when available.
- Quota failures preserve existing data and produce a recoverable message.

## G51 — Migration and version isolation

- V1.8 can seed its library from the active V1.7-compatible RoutePack without modifying V1.7 persistence.
- V1.8 has a distinct HTML entry, state key, IndexedDB database and service-worker cache.
- V1.6 and V1.7 regression suites remain green.

## G52 — Deterministic simulation, release and field gates

Before publication, all must be green:

1. G25–G52 contract tests;
2. IndexedDB-equivalent repository tests with an in-memory driver;
3. autosave, isolation, revision, duplicate, archive and delete tests;
4. photographic preview order, modes, controls and progress tests;
5. personal capture metadata and association tests;
6. media compression sizing helper tests;
7. complete export/import round trip including binary media;
8. corrupt import rollback test;
9. offline library and journal reconstruction test;
10. exact Santa Teresa RoutePack preview and walking completion;
11. complete repository regression suite;
12. browser verification of the real PocketGuide 1.8 page.

After automated publication, the final field gate is a real Galaxy S22 visit. The report must distinguish real GPS, real heading, actual camera permission, actual stored photo bytes, actual spoken cues, offline reload, exported backup and successful re-import.
