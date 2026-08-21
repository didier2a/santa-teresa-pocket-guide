# Santa Teresa Pocket Guide V2

Mini-app PWA mobile-first pour le séjour du 17 au 18 septembre 2026 à Santa Teresa di Gallura.

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
