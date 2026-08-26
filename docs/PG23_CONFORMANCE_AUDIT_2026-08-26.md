# PocketGuide V2.3 — audit contradictoire de conformité

Date de l'audit : 26 août 2026  
Référence : `PG23_LIVING_COMPANION_TECHNICAL_SPEC.md`  
Version inspectée : `2.3.0-rc1`  
Révision locale : `45e29d1`  
Version publique : <https://didier2a.github.io/santa-teresa-pocket-guide/pocketguide-v23.html>

## 1. Verdict exécutif

La V2.3 n'est pas conforme au cahier des charges « Compagnon vivant » et ne doit pas être considérée comme validée ou publiable en l'état.

Le socle V1.8–V2.2 reste largement présent et plusieurs moteurs sont fonctionnels, mais la V2.3 se comporte encore comme une interface V2.2 habillée d'un avatar et d'un fil additionnel. Elle n'est pas encore une application orchestrée de bout en bout par le compagnon audiovisuel.

Résultat des 30 gates :

- 8 conformes ;
- 14 partiellement conformes ou non démontrés de bout en bout ;
- 8 non conformes ;
- décision de release : **NO-GO**.

Les huit gates non conformes sont G123, G128, G129, G137, G140, G147, G149 et G150. Puisque chaque gate est défini comme bloquant, une seule non-conformité suffirait à empêcher la validation.

## 2. Méthode et périmètre

L'audit a combiné :

1. lecture intégrale du cahier des charges G121–G150 ;
2. inspection statique de la page V2.3, des styles, de l'orchestrateur, du moteur de scènes, du runtime d'avatar, de la voix, du Planner et des tests ;
3. simulation navigateur de la version publique sur grand écran ;
4. commande textuelle réelle « Montre-moi l'itinéraire préparé avec les photos de chaque étape » ;
5. laboratoire labial silencieux et essai `marin` ;
6. création réelle d'une proposition Bonifacio demandant trois POI et une photo vérifiée par étape ;
7. ouverture de la simulation photographique avant départ ;
8. exécution des tests V2.3 puis de toute la régression.

Limite assumée : aucun contre-test physique Galaxy S22 n'a été réalisé. Aucune autorisation de correction n'était incluse dans l'audit ; le code applicatif n'a donc pas été modifié.

## 3. Résultats des simulations de bout en bout

| Scénario | Attendu | Résultat observé | Verdict |
|---|---|---|---|
| Ouverture V2.3 | Arrivée directe face au compagnon, avatar majoritaire, prise en charge immédiate | Une modale héritée affiche « PocketGuide V2.2 », un petit avatar et deux choix avant l'expérience | Échec |
| Premier écran après la modale | Avatar plein écran, une action principale, UI révélée progressivement | L'avatar partage l'écran avec en-tête, texte, boutons, dock et fil ; la scène ne remplit que 78 % de la hauteur du viewport | Échec |
| Accueil vocal | Présence visuelle immédiate, puis accueil `marin` après le geste utilisateur requis par le navigateur | Un texte d'accueil est injecté, mais le choix initial n'aboutit pas à une salutation audible et synchronisée observée | Échec |
| « Montre-moi l'itinéraire… » | Le compagnon présente les étapes et fait défiler leurs photos | L'application commute vers la liste chronologique ; aucune photo n'y apparaît ; réponse « Je vous montre le parcours » | Échec |
| Fil vivant après la commande | Une scène photo par POI, attribuée et ordonnée | Une seule photo représente toute la route ; une image de réponse est cassée | Échec |
| Test silencieux des lèvres | Huit visèmes visibles sans réseau ni voix | Les visèmes bougent et le calque reste visible | Réussite limitée au moteur local |
| Test « voix marin » | Audio réellement joué et lèvres synchronisées sur cet audio | Le lecteur audio reste en pause, à 0 s, sans source ; le laboratoire annonce pourtant « Visible et mobile » | Échec de validation réelle |
| Préparation Bonifacio | Réflexion visible sur l'avatar, trois POI, photos progressives et attributions | RoutePack obtenu en environ 21 s, mais aucune photo ni attribution dans la réflexion ou la proposition | Échec média |
| Réflexion depuis l'espace Itinéraire | L'avatar pensif reste visible pendant le travail | Le panneau de réflexion appartient à l'espace Compagnon masqué ; seule la modale du Planner reste visible | Échec UX |
| Simulation avant départ | Le compagnon présente les 12 scènes photographiques sans disparaître | L'ancienne modale d'aperçu fonctionne, mais ne contient aucun avatar et le compagnon principal est masqué | Échec de continuité |
| AR | Avatar compact présent sans masquer la sécurité | Le CSS V2.3 force l'opacité de l'avatar à zéro en AR | Échec |
| Tests automatiques | Couvrir le comportement public réel | 31/31 tests V2.3 et 269/269 tests globaux réussissent, mais sans tester ces parcours réels | Faux sentiment de conformité |

## 4. Défauts critiques et causes établies

### C1 — La V2.3 n'ouvre pas sur le compagnon plein écran

- `pocketguide-v23.html` contient encore une modale libellée **PocketGuide V2.2**.
- `.living-app .cinema` utilise `min-height: 78svh` et non une scène plein écran.
- Sur un viewport 1363 × 936, la scène mesurée fait 1144 × 730 et l'avatar environ 650 × 641. Il est central, mais ni plein écran ni permanent.
- Le corps de page mesuré atteint environ 2105 px : l'expérience reste organisée comme une page à faire défiler.

Conséquence : le premier contact est une barrière de navigation héritée, pas une prise en charge immédiate par le compagnon.

### C2 — La conversation déclenche des écrans, pas des présentations audiovisuelles

Dans `js/pg16/guide/human-guide.js`, les mots « parcours » ou « itinéraire » déclenchent seulement `ui.open_route`. Dans `js/pg2/core/v2-actions.js`, cette action ouvre l'espace `journey`.

Il n'existe pas d'intention structurée « présenter l'itinéraire avec ses médias », ni de séquence de scènes photo associée à cette demande. La réponse orale et l'action visuelle ne partagent donc pas un contrat sémantique complet.

### C3 — Le fil de route ne sélectionne qu'une image

`createRouteScene()` dans `js/pg23/bootstrap/living-companion-runtime.js` prend la première étape possédant une image et crée une seule scène `route`. Les autres photos ne sont pas déroulées. Le fil ne peut donc pas satisfaire « photo de chaque étape » avec cette implémentation.

### C4 — Une URL vide devient une image cassée

Dans `js/pg23/scenes/living-scene-engine.js`, `safeUrl('')` résout la chaîne vide relativement à l'URL courante. Une scène sans image reçoit alors l'adresse de la page HTML comme source d'image. Le navigateur tente d'afficher `pocketguide-v23.html` comme bitmap et produit une illustration cassée.

### C5 — Le laboratoire labial ne prouve pas la synchronisation audio

Le test silencieux prouve que le moteur sait faire bouger huit formes. Il ne prouve pas que les lèvres suivent une voix réelle.

`runMarin()` lance parallèlement une animation calculée depuis le texte et `voiceService.speak()`, puis retourne les deux résultats. Le verdict affiché reste fondé sur la mesure visuelle et n'exige pas `voice.spoken === true`. Pendant l'essai public, le lecteur audio est resté sans source et à l'arrêt alors que le laboratoire annonçait une réussite.

Le service TTS protégé répond par ailleurs correctement à un appel direct et autorise l'origine GitHub Pages. Le défaut se situe donc dans le raccordement ou la remontée d'état côté application, pas dans une indisponibilité générale prouvée du service.

### C6 — Les photos du Planner ne sont pas un résultat garanti ni transparent

La proposition Bonifacio a produit un RoutePack réel de trois lieux, mais zéro média affiché et zéro attribution. Le moteur média accepte silencieusement l'absence de résultat afin de ne pas bloquer la route. Cette dégradation est acceptable pour préserver l'itinéraire, mais elle ne satisfait pas G137 et elle n'est pas expliquée à l'utilisateur.

Le parcours doit distinguer explicitement : photo vérifiée, recherche en cours, photo indisponible et erreur fournisseur. Une proposition ne doit jamais laisser croire que la demande photographique a été satisfaite lorsqu'elle ne l'a pas été.

### C7 — Le compagnon disparaît précisément dans les expériences qu'il doit orchestrer

- L'aperçu avant départ est une modale héritée sans avatar.
- Quand l'aperçu est lancé depuis l'espace Itinéraire, le panneau Compagnon est masqué.
- En AR, `[data-ar=true] .human-guide { opacity: 0 }` masque explicitement le personnage.
- La réflexion du Planner peut être rendue dans le panneau Compagnon alors que l'utilisateur se trouve dans un autre panneau.

La permanence demandée dans G123 et le mode compact prévu par la spécification ne sont donc pas réalisés.

### C8 — Plusieurs contrats V2.3 sont déclaratifs

- Dix noms figurent dans `PRESENCE_STATES`, mais les transitions `presenting`, `walking`, `arrived` et `interrupted` ne forment pas une machine d'état centrale reliée à tous les moteurs.
- Treize noms figurent dans `SCENE_TYPES`, mais aucun pont opérationnel complet n'a été trouvé pour `poi`, `map` et `consent`.
- Le contrat annonce `pg23.lipsync.started` et `pg23.lipsync.stopped`, mais le runtime V2.3 émet essentiellement `frame` et `diagnostic`.
- `persist` sépare les objets en mémoire ; le moteur de scènes ne sérialise pas à lui seul les scènes persistantes. Après rechargement, la conversation n'est pas restaurée comme un fil continu.

## 5. Matrice de conformité G121–G150

Légende : **C** conforme ; **P** partiel ou non démontré de bout en bout ; **NC** non conforme.

| Gate | État | Justification d'audit |
|---|---:|---|
| G121 | C | Page, manifeste et service worker V2.3 indépendants présents. |
| G122 | P | Les moteurs hérités existent, mais sont fragmentés en panneaux et le compagnon n'en assure pas la continuité. |
| G123 | **NC** | Modale V2.2 initiale, avatar non plein écran, absent de l'aperçu et masqué en AR. |
| G124 | P | Dix constantes existent ; plusieurs états ne sont pas pilotés comme transitions métier exclusives et traçables. |
| G125 | P | Calque visible en test local ; les trois modes ne sont pas validés avec une parole réelle dans les parcours publics. |
| G126 | C | Les huit visèmes silencieux s'animent sans API. |
| G127 | P | Les cas géométriques isolés sont détectés, mais le test `marin` peut paraître réussi sans audio joué. |
| G128 | **NC** | Aucune preuve de priorité audio → transcription → TTS sur le personnage principal ; essai `marin` sans audio. |
| G129 | **NC** | Le test mesure un `setViseme()` direct, pas le délai entre premier signal audio réel et premier mouvement visible. |
| G130 | P | L'interruption est câblée et testée isolément ; absence de test public voix + bouche + absence de reprise fantôme. |
| G131 | P | Les types sont acceptés par normalisation ; `poi`, `map` et `consent` ne sont pas tous produits par les parcours. |
| G132 | C | Ordre et déduplication du moteur réussissent en test unitaire. |
| G133 | P | Politique testée comme fonction ; non vérifiée sur un parcours public complet. |
| G134 | P | Suspension/reprise testées isolément ; continuité avec toutes les modales non démontrée. |
| G135 | P | Séparation logique présente, mais persistance du fil non réalisée comme journal restaurable. |
| G136 | P | Une scène RoutePack est créée avant confirmation, mais elle résume la route et ses médias de manière incomplète. |
| G137 | **NC** | Zéro photo et zéro attribution observées dans la préparation Bonifacio ; une seule image pour la route existante. |
| G138 | C | OSM disponible et modes Google chargés paresseusement avec consentement dans le socle hérité. |
| G139 | C | Les scènes direction/arrivée consomment `guidance.snapshot` du moteur déterministe. |
| G140 | **NC** | Le CSS masque l'avatar en AR au lieu de le passer en mode compact. |
| G141 | C | Capture personnelle volontaire, locale et métadonnées GPS honnêtes dans le moteur V1.8 conservé. |
| G142 | C | Gestion locale, reprise, duplication, archive, suppression et export/import couvertes par le socle et ses tests. |
| G143 | P | Personnalité et voix `marin` sont configurées ; la lecture réellement unifiée n'est pas démontrée par l'essai public. |
| G144 | P | Étapes Planner et annulation existent ; réflexion avatar invisible depuis certains espaces et médias absents. |
| G145 | C | Permissions principales demandées progressivement dans les parcours hérités. |
| G146 | P | Cache et stockage existent ; aucune simulation navigateur hors ligne complète V2.3 n'a été fournie par la suite. |
| G147 | **NC** | Aucun relevé réel FCP/toucher/FPS/mémoire/batterie ; animations infinies non suspendues hors écran. |
| G148 | P | Plusieurs règles clavier, contraste et mouvement réduit existent ; audit lecteur d'écran et parcours sans capacités incomplet. |
| G149 | **NC** | Le diagnostic visible n'expose pas ensemble version, état, mode, source et métriques demandées. |
| G150 | **NC** | La matrice de bout en bout échoue et aucun contre-test Galaxy S22 n'est disponible. |

## 6. Pourquoi 269 tests verts ne valident pas la V2.3

Les tests V2.3 actuels sont utiles comme contrats de non-régression, mais insuffisants comme recette UX :

- les tests portrait calculent surtout des rectangles ou recherchent des sélecteurs CSS ;
- le test de « premier visème » appelle directement le moteur de visèmes au lieu de jouer un audio ;
- les scènes sont créées comme objets isolés, sans commande utilisateur réelle ni navigateur public ;
- la « persistance » testée correspond au nettoyage d'un tableau en mémoire, pas à un rechargement d'application ;
- la session prolongée vérifie la libération d'objets simulés, pas FPS, mémoire ou batterie ;
- aucun test ne vérifie l'écran d'ouverture, le libellé V2.2, la taille relative réelle, l'aperçu sans avatar, l'AR qui masque le personnage ou le nombre de photos d'une proposition.

Conclusion : la suite teste que les briques existent, pas que la promesse « compagnon vivant » est vécue.

## 7. Plan de remise en conformité recommandé

### Phase P0-A — Refaire la coque autour du compagnon

1. Supprimer la modale d'accueil V2.2 de l'entrée V2.3.
2. Afficher immédiatement une scène avatar `hero` plein viewport, avec accueil visuel ; démarrer la voix seulement après le geste utilisateur requis par le navigateur.
3. Conserver une seule action principale voix et des raccourcis secondaires accessibles.
4. Transformer carte, itinéraire, Planner, aperçu et AR en scènes ou surfaces superposées autour d'un avatar permanent.
5. Passer automatiquement l'avatar `hero` → `guide` → `compact`, sans jamais perdre le calque labial.

### Phase P0-B — Faire de l'IA un orchestrateur sémantique

1. Remplacer les intentions qui ne font qu'ouvrir un panneau par des commandes structurées avec résultat attendu.
2. Définir `present_route`, `present_route_media`, `present_poi`, `open_map`, `start_preview`, `start_guidance`, `capture_memory` et leurs confirmations.
3. Relier chaque réponse de la guide à une transition de présence et à une ou plusieurs scènes réelles.
4. Pour « montre-moi l'itinéraire », produire une séquence : introduction → POI 1/photo/attribution → … → carte/récapitulatif.
5. Permettre l'interruption vocale, tactile et gestuelle de toute présentation.

### Phase P0-C — Corriger voix et synchronisation labiale

1. Instaurer une source de parole unique avec événements `started`, `frame`, `stopped` et `interrupted`.
2. Piloter les lèvres depuis l'énergie audio effectivement jouée, puis seulement par les deux replis normatifs.
3. Ne jamais animer depuis un texte si la lecture audio annoncée a échoué sans signaler le mode dégradé.
4. Faire échouer le test `marin` si `voice.spoken` est faux, si l'audio n'avance pas ou si le personnage principal ne bouge pas.
5. Mesurer automatiquement le délai signal → premier mouvement et l'arrêt sous 150 ms.

### Phase P0-D — Rendre les photos contractuelles

1. Enrichir chaque POI avec une requête contextuelle incluant lieu, commune et pays.
2. Émettre un état média explicite par étape : `searching`, `verified`, `unavailable`, `failed`.
3. Afficher progressivement chaque média avec auteur, licence et URL source.
4. Corriger `safeUrl('')` pour qu'une valeur vide reste vide.
5. Ne déclarer la demande photographique satisfaite que si le seuil accepté est atteint ; sinon demander si l'utilisateur accepte un parcours textuel.

### Phase P1 — Persistance, diagnostic et performance

1. Persister les scènes appartenant au voyage dans le stockage local existant et restaurer leur ordre.
2. Afficher un diagnostic unique : version, état, mode, visème, visibilité, changements, source audio, lecture active et latences.
3. Instrumenter FCP, latence tactile, délai labial, FPS, mémoire et arrêt des animations hors écran.
4. Exécuter une session prolongée réelle puis un contre-test physique Galaxy S22.

## 8. Nouvelle recette minimale avant publication

La prochaine RC ne devra être validée que si les contrôles suivants sont exécutés sur la version réellement déployée :

1. ouverture neuve à 360 × 780 : avatar visible dès le premier rendu et occupant la surface principale ;
2. après l'action principale, accueil `marin` audible : mouvement labial mesuré sur le personnage principal ;
3. « montre-moi l'itinéraire » : au moins une scène par étape, photo/absence explicitée et attribution quand présente ;
4. nouvelle excursion à trois POI : progression visible sur le visage et bilan média exact avant confirmation ;
5. aperçu, carte, marche et AR : avatar compact toujours présent et commandes accessibles ;
6. interruption en pleine phrase : audio et bouche arrêtés, aucune reprise fantôme ;
7. rechargement : voyage et scènes persistantes restaurés, scènes éphémères absentes ;
8. hors ligne : laboratoire, itinéraire, médias locaux et continuité honnête ;
9. lecteur d'écran, clavier, mouvement réduit et refus de chaque permission ;
10. métriques Galaxy S22 documentées et contre-test physique signé.

## 9. Décision

La V2.3 actuelle doit rester une RC technique non validée. La priorité n'est pas d'ajouter de nouveaux menus, mais de remplacer la navigation par panneaux par une orchestration audiovisuelle vérifiable : l'avatar doit rester le point d'entrée, le narrateur, le présentateur et le guide, tandis que les contenus apparaissent autour de lui en réponse exacte à la conversation.
