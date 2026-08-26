# PocketGuide V2.2.1 — audit de fonctionnement et de simulation

Date : 26 août 2026  
Branche : `codex/pocketguide-v2-2-unified-audiovisual`

## Résultat synthétique

- Régression automatisée : **238/238 tests réussis**.
- Contrat V2.2 : **8/8 tests réussis**.
- Simulations V2.2/V2.2.1 : **10/10 scénarios réussis**.
- Retour physique Galaxy S22 : voix audible mais lèvres immobiles sur la RC1 ; cause isolée dans l’analyse exclusive du flux WebRTC comme élément audio.
- Correctif V2.2.1 : analyse directe `MediaStream`, visèmes français pilotés par transcription et repli garanti lorsque Web Audio renvoie un niveau nul.
- Planner réel : HTTP 200, RoutePack Terra de 3 POI, 3 événements, coordonnées valides et sources HTTPS.
- TTS réel : HTTP 200, voix `marin`, MP3 mono 24 kHz de 47 232 octets.
- Média réel : Wikimedia Commons renvoie des images avec miniatures et licences CC BY-SA.
- Ressources HTTP locales V2.2 : HTML, CSS, manifeste, configuration, bootstrap et planche de visèmes répondent 200.
- Suite PWA : cache V2.2 indépendant et manifeste installable.

## Simulation G120

| Scénario | Résultat | Preuve |
|---|---|---|
| Annulation pendant la préparation | Réussi | signal aborté, ancien RoutePack inchangé |
| Fournisseur photo hors ligne | Réussi | MediaPack vide/partiel, RoutePack utilisable |
| Audio absent hors ligne strict | Réussi | texte conservé, aucune synthèse navigateur |
| Google non configuré | Réussi | aucun chargement SDK, repli OSM |
| Street View sans couverture | Réussi | message explicite, repli OSM |
| 3D incompatible | Réussi | repli Satellite |
| Interruption de l’avatar | Réussi | audio/animation neutralisés |
| Export-import avec AudioPack | Réussi | Blob audio préservé, carnet personnel non pollué |
| Realtime Android avec analyseur à zéro | Réussi | les visèmes continuent via la transcription française |
| Branchement du son distant WebRTC | Réussi | `MediaStreamAudioSourceNode`, sans double lecture audio |

## État G101–G120

| Portée | État RC1 |
|---|---|
| G101–G113 | Implémenté et simulé : réflexion, étapes, annulation, persona, `marin`, AudioPack, mode strict, visèmes, MediaPack et non-blocage |
| G114–G117 | Implémenté et simulé : OSM/Satellite/Street View/3D, consentement, couverture et replis |
| G118 | Garde technique et diagnostic implémentés ; **validation externe en attente** d’une clé Google dédiée restreinte, des quotas et alertes |
| G119 | Implémenté : attributions visibles, médias Google online-only, aucune mise en cache/export Google durable |
| G120 | Simulation automatisée réussie ; défaut labial RC1 reproduit par contrat puis corrigé en V2.2.1 ; **contre-test physique Galaxy S22 en attente** |

## Ergonomie auditée par le code et les contrats

- Une seule identité : aucun choix « IA locale / IA distante ».
- L’état de réflexion est visible au-dessus du contenu sans bloquer l’annulation ou la modification.
- Les images apparaissent progressivement avec auteur et licence.
- Le bouton arrêt coupe Realtime, TTS, reconnaissance locale et visèmes.
- Les quatre cartes sont groupées, OSM est actif par défaut et Google requiert un dialogue explicite.
- Les cibles tactiles restent à 44–46 px, les safe areas et `prefers-reduced-motion` sont conservés.
- Les photos personnelles restent locales et ne sont envoyées qu’après consentement explicite.

## Limites honnêtes avant validation finale

1. Aucun binaire Chromium/Playwright/agent-browser n’est disponible dans l’environnement : le contrôle visuel automatisé a été tenté mais n’a pas pu être exécuté. Les tests DOM/contrat, syntaxe et HTTP sont réussis.
2. Les vues Google restent volontairement désactivées dans `data/v22-config.json` tant que la clé dédiée n’est pas créée et contrôlée. Aucun appel Google ne part dans cet état.
3. Le Galaxy S22 a révélé le défaut de synchronisation labiale RC1. Le lien de diagnostic V2.2.1 permet désormais de vérifier les sept positions de bouche avant le contre-test voix réel. Les autres contrôles physiques restent : GPS, caméra, Bluetooth, reprise après verrouillage, chauffe, batterie et réseau dégradé.
4. Le point `/v2/speech` est prêt dans le Worker Cloudflare, mais la RC utilise immédiatement l’API TTS Vercel existante et sécurisée. Cette dernière a été validée en réel avec `marin`.

## Décision de publication

La V2.2.1 peut être publiée comme **correctif RC utilisable avec OSM**. Elle ne doit pas être déclarée « Google validé » ni « Galaxy S22 validé » avant les deux contrôles externes ci-dessus. L’absence de Google ne dégrade ni le Planner, ni le guide Realtime, ni l’AudioPack, ni les médias ouverts, ni le GPS, ni la simulation, ni les souvenirs locaux.
