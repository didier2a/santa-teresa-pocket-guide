# Prompt de reprise Codex

Poursuis l'application `Santa Teresa Pocket Guide` à partir de cette V2.

Lis d'abord `AGENTS.md`, `README.md`, `data/trip.json`, `index.html`, `styles.css` et `js/app.js`.

Objectifs pour la prochaine itération :
1. conserver le fonctionnement actuel sans régression ;
2. améliorer encore la finition mobile Android 360–430 px ;
3. préparer une configuration `data/settings.json` pour hôtel, ferry et lien playlist ;
4. ajouter une page/fenêtre "Détails du jour" avec parcours, durée et conseils ;
5. préparer l'intégration Google Calendar OAuth en lecture seule derrière un feature flag, sans exiger de clé pour le fonctionnement normal ;
6. ajouter des tests légers pour valider le chargement de `trip.json`, les liens Waze et les dates ;
7. conserver un build 100 % statique publiable sur GitHub Pages.

Ne remplace pas la PWA par React/Vue/Next. Ne crée pas de backend à ce stade.
