# PocketGuide V2.3 — cahier des charges fonctionnel et technique

Date de référence : 26 août 2026

Statut : norme d’implémentation avant publication

Nom produit : **PocketGuide V2.3 · Compagnon vivant**

## 1. Vision produit

PocketGuide V2.3 conserve toutes les fonctions opérationnelles de la V1.8, de la V2, de la V2.1 et de la V2.2, mais remplace la navigation centrée sur les écrans par une relation continue avec une accompagnatrice audiovisuelle. L’avatar devient la surface principale et permanente. La carte, les photographies, l’itinéraire, les indications GPS, la simulation et les souvenirs apparaissent progressivement autour de lui au moment où il les présente.

La conversation est le système de navigation principal. Les boutons restent disponibles comme raccourcis accessibles et comme solution de continuité, mais l’utilisateur ne doit pas avoir à chercher une fonction pour accomplir l’action qu’il vient de demander à la guide.

## 2. Principes non négociables

1. Une seule accompagnatrice, une seule voix `marin`, une seule continuité de personnalité.
2. L’avatar n’est jamais une décoration : son état traduit l’état réel du système.
3. Une bouche animée doit rester visible en grand portrait, en mode guide et en mode compact.
4. Un test labial hors ligne doit fonctionner sans microphone, sans OpenAI et sans réseau.
5. L’interface apparaît progressivement au rythme de la conversation, sans empêcher le toucher ni la lecture.
6. L’utilisateur peut interrompre immédiatement la voix, l’animation et la présentation.
7. Les itinéraires, photos et notes personnelles restent uniquement sur le téléphone, sauf export ou consentement ponctuel déjà prévu.
8. Aucune position, distance, direction, couverture Street View ou information touristique ne doit être inventée.
9. La V2.3 est une entrée PWA indépendante. Les versions antérieures restent accessibles et inchangées.
10. La validation automatique ne remplace jamais le contre-test visuel sur Galaxy S22.

## 3. Expérience fonctionnelle

### 3.1 Premier écran

- L’accompagnatrice occupe la majorité du premier écran.
- Son regard, sa respiration et son libellé d’état rendent sa présence compréhensible sans parole.
- Une action principale unique permet de parler.
- L’écriture, le diagnostic du visage et les autres possibilités restent accessibles sans surcharger le premier plan.

### 3.2 États de présence

La machine d’états normative est :

- `ready` : présence calme et disponible ;
- `listening` : écoute active, micro réellement ouvert ;
- `thinking` : traitement réel ou préparation en cours ;
- `speaking` : parole audible ou narration en cours ;
- `presenting` : contenu visuel présenté au même moment ;
- `walking` : accompagnement GPS actif ;
- `arrived` : arrivée confirmée par les règles déterministes ;
- `interrupted` : arrêt immédiat demandé ;
- `degraded` : capacité indisponible expliquée sans fausse précision ;
- `error` : erreur récupérable et action suivante explicite.

Une transition possède une source, un horodatage et une raison. Deux moteurs ne peuvent pas imposer simultanément des états contradictoires.

### 3.3 Synchronisation labiale

Le système labial utilise huit visèmes : `neutral`, `mbp`, `fv`, `a`, `ei`, `o`, `u`, `lt`.

Ordre de priorité :

1. énergie du flux audio réellement joué ;
2. transcription Realtime progressive ;
3. texte exact du clip TTS local ;
4. aucune animation aléatoire si aucune parole n’est active.

Le portrait et la bouche appartiennent au même repère géométrique. Le portrait est ajusté dans son cadre en conservant le ratio 820/852, puis la bouche est positionnée relativement au portrait rendu et non relativement à la fenêtre. Le mode compact ne peut jamais masquer le calque labial.

Le laboratoire intégré propose :

- un test silencieux des huit visèmes ;
- un test séquencé sur une phrase française ;
- un test avec la voix `marin` lorsqu’elle est disponible ;
- un affichage lisible de l’état, du visème, du nombre de changements et de la visibilité calculée ;
- un verdict local `visible`, `masqué`, `hors cadre` ou `immobile`.

### 3.4 Fil de voyage vivant

Sous la scène principale, un fil chronologique reçoit des scènes typées :

- parole de la guide ;
- réflexion ;
- proposition d’itinéraire ;
- photographie touristique avec attribution ;
- étape/POI ;
- carte ;
- direction GPS ;
- arrivée ;
- simulation avant départ ;
- souvenir personnel ;
- consentement ;
- erreur ou continuité hors ligne.

Chaque scène contient au minimum `id`, `type`, `createdAt`, `source`, `persist`, `title` et ses données spécifiques. Une scène persistante appartient au voyage ; une scène éphémère appartient uniquement à la session.

### 3.5 Directeur de défilement

- Une nouvelle scène peut être révélée automatiquement si l’utilisateur se trouve près de la fin du fil et n’interagit pas.
- Un toucher, un défilement manuel, un champ actif, un dialogue ou `prefers-reduced-motion` suspend le défilement automatique.
- Si la présentation continue pendant cette suspension, un bouton « La guide vous montre la suite » apparaît.
- L’avatar reste visible dans une forme adaptée pendant l’exploration du fil.
- Aucun changement de scène ne doit ramener brutalement l’utilisateur en haut de page.

### 3.6 Adaptation de l’avatar

- `hero` : grand portrait pour l’accueil, la préparation et la conclusion ;
- `guide` : portrait moyen pendant une présentation ou un récit ;
- `compact` : portrait flottant pendant la marche, l’AR, la carte ou la consultation ;
- la transition est douce mais la bouche reste fonctionnelle dans les trois formes ;
- l’avatar ne doit pas masquer les commandes GPS ou les contenus importants.

### 3.7 Fonctions héritées obligatoires

La V2.3 réutilise sans régression : création d’excursion vocale ou textuelle, proposition/confirmation, simulation photographique, carte OSM, modes Google optionnels et consentis, GPS et guidage déterministe, AR, explication des POI, capture photo volontaire, association géographique, note vocale, carnet audiovisuel, bibliothèque locale, reprise, renommage, duplication, archivage, suppression, export et import complet.

## 4. Architecture technique

### 4.1 Modules V2.3

- `avatar/living-avatar-runtime.js` : état, géométrie, visèmes, diagnostic et interruption ;
- `scenes/living-scene-engine.js` : création, déduplication, ordre et persistance logique des scènes ;
- `scenes/scroll-director.js` : politique de révélation et respect de l’interaction humaine ;
- `bootstrap/living-companion-runtime.js` : pont entre Realtime, V2.2, itinéraires, GPS, média et scènes ;
- `bootstrap/app.js` : démarre V2.3 autour du runtime V2.2 existant.

### 4.2 Contrat événementiel

Les événements V2.3 sont préfixés `pg23.`. Les événements structurants sont :

- `pg23.presence.changed` ;
- `pg23.avatar.geometry` ;
- `pg23.lipsync.started`, `frame`, `stopped`, `diagnostic` ;
- `pg23.scene.created`, `updated`, `presented` ;
- `pg23.scroll.suspended`, `resumed`, `pending` ;
- `pg23.lab.started`, `completed` ;
- `pg23.runtime.ready`.

Les événements ne contiennent jamais de clé, de photographie binaire ou de donnée personnelle non nécessaire.

### 4.3 Realtime et voix

- Le WebRTC existant reste servi par le pont Cloudflare protégé.
- La synthèse des textes internes continue d’utiliser la voix `marin` par le service protégé existant.
- La transcription audio progressive alimente les visèmes et les scènes de parole.
- `response.done` ne peut pas neutraliser le visage avant la fin perceptible de la parole.
- L’interruption utilisateur annule la réponse, coupe le TTS et neutralise la bouche en moins de 150 ms côté interface.

### 4.4 Stockage et confidentialité

- Les préférences V2.3 et les scènes éphémères utilisent uniquement la session ou le stockage local.
- Les scènes persistantes dérivent des données déjà stockées dans l’itinéraire ; aucun nouveau cloud personnel n’est introduit.
- Les photos Google restent en ligne et hors export.
- Les photos personnelles ne sont transmises qu’après action et consentement explicites.

### 4.5 Hors ligne

Le shell, l’avatar, les visèmes, le laboratoire, les itinéraires enregistrés, les AudioPacks disponibles et les souvenirs personnels restent accessibles hors ligne. Une fonction réseau absente se transforme en scène de continuité honnête et ne bloque pas les données locales.

### 4.6 Performance Galaxy S22

- premier rendu utile inférieur à 2,5 s sur connexion normale après cache froid ;
- réponse visuelle à un toucher inférieure à 100 ms ;
- démarrage d’un mouvement de bouche inférieur à 180 ms après le premier signal de parole disponible ;
- animation limitée à 30 images/s lorsque 60 images/s n’apporte pas de bénéfice visible ;
- arrêt des animations hors écran ;
- aucun décodage vidéo permanent ;
- pas de nouvelle dépendance lourde ;
- mémoire et batterie surveillées par une simulation de session prolongée.

### 4.7 Accessibilité

- cibles tactiles d’au moins 44 px ;
- libellés vocaux et visuels cohérents ;
- navigation clavier ;
- contraste lisible ;
- `aria-live` non bavard ;
- `prefers-reduced-motion` supprime les mouvements décoratifs mais conserve les changements labiaux nécessaires à la compréhension ;
- le contenu reste utilisable sans voix, sans caméra, sans GPS et sans animation.

## 5. Critères d’acceptation G121–G150

| Gate | Critère bloquant |
|---|---|
| G121 | La V2.3 possède une page, un manifeste et un cache PWA indépendants sans modifier les entrées antérieures. |
| G122 | Toutes les fonctions obligatoires héritées de la V1.8 et de la V2.2 restent accessibles. |
| G123 | L’avatar occupe la surface principale du premier écran et reste présent dans le parcours principal. |
| G124 | Les dix états de présence sont explicites, déterministes et testés. |
| G125 | Le calque labial est visible et dans le visage en modes `hero`, `guide` et `compact`. |
| G126 | Le test silencieux parcourt les huit visèmes sans réseau, microphone ni API. |
| G127 | Le laboratoire détecte un calque masqué, hors cadre ou immobile et ne peut annoncer un faux succès. |
| G128 | La synchronisation utilise l’audio, puis la transcription, puis le texte TTS ; elle reste neutre hors parole. |
| G129 | Le premier mouvement labial respecte la cible de 180 ms à partir du signal disponible. |
| G130 | L’interruption neutralise la bouche et la voix immédiatement, sans reprise fantôme. |
| G131 | Le fil vivant accepte toutes les catégories de scène normatives. |
| G132 | Les scènes apparaissent dans l’ordre de la conversation et sont dédupliquées. |
| G133 | Le défilement automatique ne s’exécute que lorsque sa politique l’autorise. |
| G134 | Une interaction humaine suspend le défilement et affiche une reprise explicite si nécessaire. |
| G135 | Les scènes persistantes et éphémères sont séparées sans nouveau cloud personnel. |
| G136 | Une proposition d’itinéraire produit une scène fondée sur le RoutePack réel avant confirmation. |
| G137 | Les photos touristiques apparaissent progressivement avec auteur, licence et source. |
| G138 | OSM reste disponible ; Google reste optionnel, paresseux, consenti et sans archivage durable. |
| G139 | Les scènes de direction utilisent uniquement les sorties du moteur GPS déterministe. |
| G140 | L’AR reste ouvrable et l’avatar ne masque pas ses commandes de sécurité. |
| G141 | La capture d’un souvenir reste volontaire, locale et géographiquement honnête. |
| G142 | Bibliothèque, reprise, duplication, archivage, suppression et export/import complet restent opérationnels. |
| G143 | Realtime et textes internes utilisent la personnalité unique et la voix `marin`. |
| G144 | La préparation affiche ses étapes réelles, peut être modifiée ou annulée et préserve le voyage actif. |
| G145 | Microphone, GPS, caméra, Google et analyse d’image sont demandés progressivement avec explication. |
| G146 | Le shell, le laboratoire, les voyages et les médias locaux restent utilisables hors ligne. |
| G147 | Les budgets de réponse, animation, mémoire et absence de vidéo permanente sont contrôlés. |
| G148 | Toucher, clavier, contraste, lecteurs d’écran et réduction des mouvements sont couverts. |
| G149 | Le diagnostic expose version, état, mode portrait, visème, visibilité, changements et source sans donnée secrète. |
| G150 | La matrice de simulation complète réussit ; la mention « Galaxy S22 validé » reste interdite avant un contre-test physique réussi. |

## 6. Matrice minimale de simulation

1. Test silencieux des huit visèmes dans les trois tailles de portrait.
2. Calque forcé en `display:none` : verdict attendu `masqué`.
3. Calque déplacé hors du portrait : verdict attendu `hors cadre`.
4. Séquence figée : verdict attendu `immobile`.
5. Transcription progressive avec niveau audio nul : bouche animée.
6. Audio actif sans transcription : bouche animée par énergie.
7. Interruption pendant parole : voix et bouche neutralisées.
8. Scènes parole → photo → itinéraire → carte dans le bon ordre.
9. Défilement proche de la fin : révélation autorisée.
10. Défilement manuel/édition/dialogue : révélation suspendue et reprise proposée.
11. Préparation annulée : voyage actif inchangé.
12. Média absent : itinéraire et conversation encore utilisables.
13. Réseau absent : laboratoire et voyages locaux utilisables.
14. GPS imprécis : aucune direction précise inventée.
15. Photo personnelle : stockage local et consentement avant analyse distante.
16. Export/import : itinéraire, AudioPack et médias personnels préservés.
17. Mode compact pendant marche et arrivée : lèvres encore visibles.
18. Réduction des mouvements : interface stable et bouche fonctionnelle pendant la parole.
19. Session prolongée simulée : aucune minuterie ou file de scènes non libérée.
20. Régression de toutes les suites V1.5 à V2.2.

## 7. Méthode de livraison

1. Implémenter un laboratoire labial autonome et le faire réussir automatiquement.
2. Implémenter le moteur d’avatar et les trois géométries.
3. Implémenter le fil vivant et le directeur de défilement.
4. Raccorder les événements Realtime, TTS, Planner, GPS, simulation, média et mémoire.
5. Exécuter les contrats V2.3, les vingt simulations et la régression générale.
6. Auditer les ressources publiques, le cache et la version réellement servie.
7. Publier comme **V2.3 RC** ; attendre le contre-test physique Galaxy S22 pour déclarer G150 complètement validé.
