# PocketGuide 2.1 — audit de publication

Date : 26 août 2026  
Portée : cahier des charges G81–G100, régression V1.2–V2, IA distante existante, simulation locale et publication PWA.

## Verdict

**GO technique pour publication V2.1.** Les portes G81 à G99 sont satisfaites par le code, les tests automatisés et les contrôles de service. G100 reste volontairement scindée : matrice automatisée verte ; microphone, haut-parleur, GPS, orientation, caméra et marche réelle à confirmer physiquement sur Galaxy S22.

## Résultats vérifiés

- 220 tests automatisés exécutés, 220 réussis, 0 échec.
- 9 tests dédiés V2.1 réussis : personnage, trois espaces, huit moments, concierge, permissions progressives, proposition, simulation, Realtime/local, PWA et accessibilité.
- 111 identifiants HTML contrôlés sans doublon.
- Tous les imports JavaScript V2.1 et tous les assets requis par le cache hors ligne sont résolus.
- Syntaxe JavaScript, JSON, structure CSS et `git diff --check` validés.
- Page, feuille de style, manifeste, portrait et modules servis localement avec HTTP 200.
- Route de santé distante : clé existante configurée ; modèles déclarés `gpt-realtime-2.1-mini`, `gpt-realtime-2.1`, `gpt-5.6-terra` et `gpt-4o-mini-transcribe`.
- Planner réel : RoutePack Porto-Vecchio de 90 minutes, trois POI, coordonnées et sources générés et validés via la clé existante.
- Guide touristique réel : réponse factuelle avec source et conseil de visite générée via `/v2/guide/answer`.
- Simulateur déterministe historique : parcours Santa Teresa mené jusqu’à la fin par le moteur de guidance de production.

## Audit ergonomique

1. L’accueil ouvre une relation humaine et une action principale.
2. La création conversationnelle collecte destination, durée, rythme et intérêts, une question à la fois.
3. « Autour de moi » exige une position mesurée et refuse une origine simulée ou absente.
4. Les huit moments adaptatifs pilotent titre, message, action, densité et portrait.
5. Toute création conserve le voyage courant avant confirmation.
6. La proposition résume durée, distance, POI, rythme, lieux et images disponibles.
7. Après confirmation, la simulation photographique est proposée immédiatement.
8. Le mode marche replie la conversation à son entrée et conserve direction, distance, prochain POI et voix.
9. Caméra et AR restent derrière un geste explicite ; aucune image personnelle n’est envoyée automatiquement.
10. « Mes voyages » conserve reprise, simulation, carnet, photo, duplication, archive, suppression, import et export local complet.

## Personnage produit

Asset local : `assets/companion/human-guide-v21.webp`, 820 × 852 px, WebP transparent, environ 115 Ko.

Prompt de production utilisé : « one premium stylized human travel guide, Mediterranean adult around 40, elegant contemporary gender-neutral presentation, expressive calm eyes, subtle half-smile, semi-realistic editorial 3D, transparent background, petrol/teal/sand palette, no text/logo/watermark/props. »

## Limites honnêtes avant validation terrain

- Le navigateur Chromium de l’environnement d’audit n’a pas pu être téléchargé à cause d’un délai réseau ; le scénario navigateur automatisé portrait/paysage est prêt mais n’a pas produit de capture locale.
- Une session Realtime WebRTC complète exige un navigateur avec microphone et sortie audio. L’endpoint, la configuration, les interruptions, le repli local et la logique d’état sont validés ; la perception audio physique reste G100.
- Les visuels d’un RoutePack généré dépendent des médias vérifiés disponibles. L’absence d’image ne bloque jamais la proposition ni la guidance.

## Scénario terrain G100

1. Ouvrir la V2.1 sur Galaxy S22 et choisir « Commencer avec ma guide ».
2. Vérifier écoute, réponse vocale, interruption pendant la parole et reprise.
3. Demander une excursion « autour de moi » et vérifier que le GPS est demandé seulement à ce moment.
4. Contrôler la proposition enrichie, refuser une première fois, puis recréer et confirmer.
5. Lancer la simulation photographique avant le départ et confirmer que la progression réelle ne change pas.
6. Démarrer la marche, contrôler guidance, changement de densité, distance et arrivée sur deux échantillons fiables.
7. Ouvrir l’AR par geste explicite, refuser puis autoriser la caméra.
8. Photographier un souvenir, l’associer au POI, ajouter une note vocale, fermer et recharger l’application.
9. Exporter le voyage `.pocketguide`, le réimporter comme copie et contrôler les médias.
10. Passer hors ligne et vérifier parcours, guidance, carnet et identité de la guide en mode essentiel.
