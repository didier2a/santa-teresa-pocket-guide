# PocketGuide V2.3.1 — clôture de l’audit de conformité

Date : 26 août 2026  
Audit source : `PG23_CONFORMANCE_AUDIT_2026-08-26.md`  
Cahier des charges : `PG23_LIVING_COMPANION_TECHNICAL_SPEC.md`

## Verdict

Les huit non-conformités logicielles C1 à C8 relevées sur la V2.3 ont été corrigées dans la V2.3.1. Les contrats G121 à G149 disposent maintenant d’une implémentation et d’une preuve automatisée. G150 reste volontairement soumis au contre-test physique Galaxy S22 exigé par le cahier des charges : aucune mention « Galaxy S22 validé » n’est autorisée avant ce test utilisateur.

## Résolution point par point de l’audit

| Défaut | Résolution V2.3.1 | Preuve |
|---|---|---|
| C1 — accueil hérité et avatar non plein écran | La modale héritée n’est plus ouverte en V2.3 ; l’application arrive sur le compagnon en `hero`, dans une scène `100svh`, avec une action vocale principale. | Contrat d’ouverture V2.3.1 et simulation S24. |
| C2 — commande qui ouvre seulement un écran | Nouvelle action sûre `pg23.present_route`, intention textuelle sémantique et outil Realtime `present_journey`. | Contrat de présentation et simulation S27. |
| C3 — une seule image pour toute la route | Le directeur produit introduction, une scène `media` ou `poi` honnête par lieu, puis une scène carte. | Simulations S26 et S27. |
| C4 — URL vide transformée en image cassée | `safeUrl('')` retourne strictement une chaîne vide. Le faux média local Modesto inexistant a également été supprimé du catalogue. | S25 et contrat média manquant. |
| C5 — faux succès du laboratoire `marin` | Le laboratoire exige désormais `voice.spoken`, une lecture réelle et des changements du personnage principal ; sinon le verdict échoue explicitement. | S31 et S32. |
| C6 — médias Planner silencieusement absents | Les recherches incluent lieu et destination, chaque POI émet `verified`, `unavailable` ou `failed`, et la proposition affiche chaque photo ou son absence. | S20, S26, S28 et contrat Planner/média. |
| C7 — disparition du compagnon | L’avatar reste en mode compact dans Voyage, Mes voyages, Planner, proposition, aperçu et AR ; les surfaces V2.3 sont non modales autour de lui. | Contrat de permanence V2.3.1. |
| C8 — contrats seulement déclaratifs | Machine centrale à dix états traçables, ponts Planner/GPS/média/preview/mémoire, événements labiaux complets, stockage local des scènes et diagnostic réel. | S29 à S33 et contrats G124/G128/G129/G147/G149. |

## Couverture G121–G150

| Gates | État V2.3.1 |
|---|---|
| G121–G123 | PWA indépendante, héritage préservé, compagnon plein écran et permanent. |
| G124–G130 | Dix états déterministes ; bouche visible dans les trois géométries ; audio → transcription → texte ; latence mesurée ; interruption neutre. |
| G131–G137 | Treize scènes, ordre/déduplication, défilement respectueux, persistance locale, RoutePack réel et médias progressifs attribués ou explicitement absents. |
| G138–G146 | OSM conservé, Google consenti, GPS déterministe, AR avec avatar compact, souvenirs et voyages locaux, voix `marin`, Planner annulable, permissions progressives et cache hors ligne. |
| G147 | FCP/premier rendu, toucher, latence labiale, FPS borné, tâches longues, mémoire, batterie et vidéos actives instrumentés ; analyse audio plafonnée à 30 Hz et arrêtée au repos. |
| G148–G149 | Toucher, clavier, contraste, mouvement réduit, `aria-live` et diagnostic sans secret couvrant version, état, portrait, visème, visibilité, changements, source, audio et métriques. |
| G150 | Matrice automatisée réussie. Contre-test physique Galaxy S22 encore requis par contrat. |

## Résultats reproductibles

- Tests V2.3.1 : 48 scénarios de contrat et de simulation réussis.
- Régression complète V1.4.8 → V2.3.1 : 286 tests réussis, aucun échec.
- Audit HTTP du cache : 80 ressources obligatoires chargées, 80 réponses valides, aucun fichier vide.

## Correctif de démarrage 2.3.1.1

- Le runtime V2.2 hérité ne peut plus modifier l’identité visuelle ou le titre lorsqu’il s’exécute dans la coque V2.3.1.
- Les fonctions natives `requestAnimationFrame` et `cancelAnimationFrame` sont invoquées avec le receveur global attendu par Android/WebIDL.
- Le script de démarrage et le cache PWA ont une nouvelle révision afin que le Galaxy S22 ne réutilise pas le runtime fautif déjà installé.
- Deux tests de non-régression couvrent explicitement la reprise de titre V2.2 et le démarrage du moniteur d’animation Android.

## Correctif anti-cache 2.3.1.2

- Le bootstrap V2.3, le bootstrap hérité V2.2, le runtime vivant et le moniteur de performance utilisent désormais des URL de module révisionnées.
- Même lorsqu’un ancien service worker contrôle encore le premier chargement, il ne peut plus répondre avec les modules 2.2 non révisionnés.
- Un verrou d’identité léger est installé avant les imports hérités et rétablit immédiatement le titre et le libellé V2.3.1 en cas de tentative de remplacement.
- Les caches V2.2 et V2.3 sont renouvelés et l’application PWA passe à la révision `8.3.3`.
- `git diff --check` : aucune erreur d’espace ou de patch.
- Clé OpenAI : aucune clé dans le navigateur ou le dépôt ; le pont protégé existant est réutilisé.

## Limite de validation

L’environnement d’exécution automatisé ne contient pas de binaire Chromium. Aucun faux résultat visuel navigateur n’est donc déclaré. Le contrôle HTTP et les simulations DOM/contrats sont automatisés ; la caméra, le microphone, le haut-parleur, l’autoplay Android, le recadrage final et les mesures terrain doivent être contre-testés sur le Galaxy S22 réel avant de signer G150.
