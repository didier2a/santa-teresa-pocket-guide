# Santa Teresa Pocket Guide V2

Mini-app PWA mobile-first pour le séjour du 17 au 18 septembre 2026 à Santa Teresa di Gallura.

## V2.3.1 — compagnon vivant orchestrateur

La V2.3.1 place l’avatar au centre dès l’ouverture et le conserve en mode compact dans le voyage, le Planner, l’aperçu et l’AR. Une demande comme « Montre-moi l’itinéraire » déclenche une présentation progressive POI par POI avec photo attribuée ou absence explicite, puis carte. La voix `marin`, la synchronisation labiale, les états de présence, les scènes persistantes et le diagnostic de performance partagent maintenant le même runtime.

- Application : `pocketguide-v23.html`
- Cahier des charges : `docs/PG23_LIVING_COMPANION_TECHNICAL_SPEC.md`
- Audit contradictoire : `docs/PG23_CONFORMANCE_AUDIT_2026-08-26.md`
- Clôture V2.3.1 : `docs/PG231_RELEASE_VALIDATION_2026-08-26.md`
- Tests : `node --test tests/*.test.mjs`
- La validation physique Galaxy S22 reste distincte de la simulation automatisée.

## V2.2 RC1 — accompagnatrice audiovisuelle unifiée

La V2.2 conserve le socle V1.8/V2.1 et unifie toute l’expérience autour de la même personne, du même avatar et de la voix OpenAI `marin`. Elle ajoute la réflexion visible et annulable, l’AudioPack hors ligne strict, les visèmes pilotés par le flux audio, les photos progressives avec provenance et quatre modes cartographiques à consentement explicite.

- Application : `pocketguide-v22.html`
- Cahier des charges : `docs/PG22_AUDIVISUAL_TECHNICAL_SPEC.md`
- Audit : `docs/PG22_RELEASE_AUDIT.md`
- Tests : `node --test tests/*.test.mjs`
- Google Satellite/Street View/3D reste désactivé tant que la clé dédiée restreinte, les quotas et alertes ne sont pas validés ; OSM reste pleinement opérationnel.

## V2.1 — guide humaine adaptative

La V2.1 conserve toutes les capacités de la V1.8/V2 et refond l’expérience autour d’une guide humaine stylisée, vocale et audiovisuelle. L’interface se réduit à trois espaces — Compagnon, Voyage et Mes voyages — et s’adapte automatiquement aux moments accueil, préparation, départ, marche, arrivée, simulation et carnet.

- Application : `pocketguide-v21.html`
- Cahier des charges : `docs/PG21_ERGONOMIC_TECHNICAL_SPEC.md`
- Audit : `docs/PG21_RELEASE_AUDIT.md`
- Tests : `node --test tests/*.test.mjs`

## V2

- agenda des deux jours avec liens directs vers les événements Google Agenda existants ;
- prochaine étape dynamique ;
- boutons Waze conformes aux Deep Links officiels ;
- carte Leaflet + parcours par jour ;
- carte illustrée disponible hors ligne ;
- géolocalisation et calcul des lieux les plus proches ;
- fiches lieux ;
- playlist ;
- checklist persistante ;
- PWA installable avec service worker ;
- données du séjour centralisées dans `data/trip.json`.

## Lancer en local

Depuis ce dossier :

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Publier

Le projet est statique et convient à GitHub Pages, Cloudflare Pages, Netlify ou Vercel.

## Google Agenda

La V2 utilise un **instantané** des événements du Google Agenda principal créé le 21 août 2026 : les boutons ouvrent les événements réels. Il ne s'agit pas encore d'une lecture OAuth temps réel côté navigateur.

La V3 peut ajouter OAuth Google Calendar en lecture seule, une fois le projet Google Cloud / Client ID créé.

## Données à compléter

- nom et adresse exacte de l'hôtel ;
- traversées ferry définitives Bonifacio ⇄ Santa Teresa ;
- éventuels restaurants retenus ;
- lien vers une playlist personnelle Spotify / YouTube Music si souhaité.

## Déploiement GitHub Pages

Le dépôt est prêt pour GitHub Pages via `.github/workflows/pages.yml`. L’URL cible est `https://didier2a.github.io/santa-teresa-pocket-guide/`.
