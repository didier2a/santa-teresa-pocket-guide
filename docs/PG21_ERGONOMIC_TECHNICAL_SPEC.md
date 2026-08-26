# PocketGuide 2.1 — cahier des charges ergonomique et technique

## 1. Intention

PocketGuide 2.1 transforme PocketGuide 2.0 en compagnon humain adaptatif. L’utilisateur ne cherche plus une fonction : il parle à la guide, qui choisit l’interface, l’information et l’action utiles au moment présent.

La V2.1 reste une PWA légère, progressive, hors ligne et respectueuse de la vie privée. Elle réutilise les RoutePacks, le Planner vérifié, le GPS, la guidance, la Geo-AR, la simulation photographique, IndexedDB et les sauvegardes portables de la V1.8/V2.

## 2. Les dix moments ergonomiques normatifs

1. **Accueil humain** — la guide accueille l’utilisateur et présente une seule action principale.
2. **Intention libre** — l’utilisateur formule naturellement ce qu’il souhaite faire.
3. **Compréhension** — la guide distingue question, création, reprise, simulation et consultation.
4. **Affichage contextuel** — la vue pertinente s’ouvre automatiquement sans chasse aux menus.
5. **Confirmation** — toute modification structurelle reste une proposition réversible.
6. **Mode marche** — au départ, l’écran devient lisible d’un coup d’œil et la voix domine.
7. **Accueil au POI** — à l’arrivée, la guide raconte, montre et propose l’observation AR.
8. **Souvenir situé** — une photo initiée par l’utilisateur est associée au lieu ou au segment.
9. **Carnet local** — le voyage et ses médias composent une mémoire audiovisuelle privée.
10. **Clôture** — la guide célèbre la fin et propose le carnet, la simulation souvenir ou un nouveau voyage.

## 3. Présence humaine stylisée

- Une seule identité visuelle cohérente : `assets/companion/human-guide-v21.webp`.
- Portrait central à l’accueil et pendant la préparation.
- Médaillon compact en mode marche, arrivée et consultation.
- États visuels : repos, écoute, réflexion, parole et mode essentiel.
- Animation uniquement par CSS (respiration, halo, regard simulé par micro-mouvement), désactivée avec `prefers-reduced-motion`.
- L’interface ne prétend jamais que la guide voit ou entend si les capteurs correspondants sont fermés.

## 4. Moteur de moments

Le moteur dérive un moment unique à partir de l’état PocketGuide :

- `welcome` : première ouverture ;
- `prepare` : demande ou préparation d’un parcours ;
- `ready` : parcours prêt, pas de marche active ;
- `walking` : GPS actif et déplacement vers un POI ;
- `arrived` : arrivée confirmée au POI ;
- `preview` : simulation photographique ouverte ;
- `completed` : parcours terminé ;
- `memories` : consultation des voyages et carnets.

Chaque moment fournit : priorité, titre, message, libellé de l’action principale, action secondaire, densité visuelle et comportement du portrait.

## 5. Architecture de navigation

Trois espaces seulement :

1. **Compagnon** — présence, voix, indication contextuelle et conversation.
2. **Voyage** — étapes et carte du RoutePack actif.
3. **Mes voyages** — itinéraires locaux, carnets, photos, import et export.

La guide peut ouvrir ces espaces via les mêmes actions que les boutons. La navigation reste utilisable sans IA.

## 6. Création conversationnelle

En repli local, un concierge déterministe collecte progressivement : destination ou « autour de moi », durée, rythme et centres d’intérêt. Il ne pose qu’une question courte à la fois et ne lance le Planner qu’avec les éléments indispensables.

En Realtime, les instructions imposent le même dialogue. Le Planner reçoit la position seulement pour une demande explicite « ici/autour de moi ». Le parcours précédent ne devient jamais une destination implicite.

## 7. Proposition enrichie

Avant confirmation, la proposition affiche :

- titre et destination ;
- durée estimée ;
- distance pédestre estimée ;
- nombre de POI ;
- difficulté indicative, sans promesse d’accessibilité ;
- lieux principaux et jusqu’à quatre visuels disponibles ;
- rappel que le voyage actuel reste intact avant confirmation.

Après confirmation, la guide propose immédiatement la simulation photographique.

## 8. Mode marche

- Une direction principale, le prochain POI, la distance et un grand bouton de parole.
- La conversation et les commandes secondaires sont repliables.
- L’AR et la caméra restent derrière un geste explicite.
- Aucune arrivée précise lorsque la qualité GPS est dégradée.
- Les coordonnées simulées sont supprimées avant toute session réelle.

## 9. Vie privée et stockage

- RoutePacks, progression, photos et notes vocales sont sauvegardés localement.
- Aucune photo personnelle n’est transmise automatiquement.
- Une analyse d’image nécessite une confirmation ponctuelle et explicite.
- Import/export `.pocketguide` conserve itinéraire et médias.
- Aucun cloud de souvenirs en V2.1.

## 10. Portes d’acceptation G81–G100

- **G81** : le personnage humain stylisé est un asset local optimisé et accessible.
- **G82** : les cinq états de présence modifient visuellement le personnage sans changer son identité.
- **G83** : trois espaces primaires exactement, dont « Mes voyages ».
- **G84** : un moteur déterministe expose les huit moments contextuels.
- **G85** : une seule action principale est visible dans le compagnon.
- **G86** : le mode marche réduit la densité et conserve direction, distance, POI et parole.
- **G87** : l’arrivée déclenche narration, visuel et proposition AR sans ouverture automatique de caméra.
- **G88** : le concierge local collecte destination, durée, rythme et intérêts une question à la fois.
- **G89** : une demande « autour de moi » refuse d’inventer une origine sans GPS mesuré.
- **G90** : la proposition enrichie affiche durée, distance, POI, difficulté et visuels.
- **G91** : aucun RoutePack actif n’est remplacé avant confirmation explicite.
- **G92** : la confirmation réussie propose immédiatement la simulation.
- **G93** : la simulation ne modifie jamais la progression réelle.
- **G94** : les permissions voix, GPS et caméra sont progressives et expliquées.
- **G95** : une photo est locale, initiée par l’utilisateur et associée géographiquement sans coordonnées inventées.
- **G96** : « Mes voyages » conserve gestion, carnet, duplication, archive, suppression, import et export.
- **G97** : le guide Realtime et le repli local partagent une identité et des états d’interface uniques.
- **G98** : le service worker installe la V2.1 indépendamment des versions antérieures.
- **G99** : cibles tactiles ≥ 44 px, contraste, libellés, paysage et réduction des animations sont vérifiés.
- **G100** : la matrice automatisée est verte ; microphone, caméra, GPS, orientation et marche réelle restent à valider physiquement sur Galaxy S22.

## 11. Critère de publication

Publication uniquement après contrôles de syntaxe, tests G81–G100, non-régression complète, simulation navigateur du parcours principal, vérification des erreurs d’exécution et audit du lien public.
