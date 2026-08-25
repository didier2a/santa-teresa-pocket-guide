# PocketGuide V2 — contrat d’acceptation du compagnon audiovisuel

## Vision normative

PocketGuide V2 n’est pas une application qui contient un assistant. Le compagnon vocal et audiovisuel est l’interface principale, l’orchestrateur et la continuité humaine du produit. Le smartphone lui fournit, avec les permissions explicites du voyageur, une voix, une écoute, une vision ponctuelle, une position, une orientation, une carte, une mémoire locale et une vue Geo-AR.

La V2 conserve les capacités fonctionnelles de la V1.8. Elle remplace leur présentation technique par une expérience unique, simple et cohérente. Les moteurs en ligne, locaux et déterministes restent séparés en interne afin de préserver la sécurité, la vérité du parcours et le fonctionnement hors ligne.

## Portée héritée

- RoutePack vérifié, création vocale ou textuelle et remplacement après confirmation.
- Guidage GPS audiovisuel, progression, arrivée fiable et Geo-AR.
- Simulation photographique avant le voyage.
- Bibliothèque locale, reprise, duplication, renommage, archivage et suppression.
- Photographies géolocalisées, notes vocales et carnet audiovisuel.
- Export et import portable complet sans synchronisation cloud automatique.
- PWA installable, utilisable hors ligne et prioritaire Android/Chrome.

## Gates V2 — G53 à G80

### G53 — Compagnon unique
L’interface ne distingue jamais « IA Realtime » et « IA locale ». Une seule personnalité, un seul historique et une seule commande centrale sont exposés.

### G54 — Trois espaces maximum
La navigation principale comporte uniquement Compagnon, Voyage et Souvenirs. Les cartes, formulaires et outils secondaires sont contextuels.

### G55 — Présence humaine audiovisuelle
Les états disponible, connexion, écoute, réflexion, vérification, parole, mode discret, hors ligne et erreur sont visibles, annoncés et cohérents avec l’état réel.

### G56 — Connexion Realtime véridique
Le compagnon n’annonce jamais être prêt avant l’ouverture effective du canal WebRTC. Un délai maximal, les erreurs de canal et les changements de connexion sont traités.

### G57 — Voix bidirectionnelle
Le microphone, la réponse audio, la détection de parole, l’interruption et la reprise sont configurés explicitement. L’utilisateur peut couper l’écoute à tout instant.

### G58 — Repli transparent
Une panne du service IA conserve la même interface et la même personnalité. Les commandes déterministes, le texte, le parcours, le GPS, la carte, les médias et les souvenirs restent utilisables.

### G59 — Orchestrateur outillé
Le compagnon lit le contexte et peut demander l’ouverture d’une vue, raconter un lieu, poursuivre le parcours, proposer un raccourcissement, créer un RoutePack, simuler un voyage et ouvrir le carnet.

### G60 — Confirmation structurelle
Un remplacement, un raccourcissement, un saut ou une suppression ne modifie rien avant une confirmation explicite.

### G61 — Création universelle de RoutePack
Depuis n’importe quelle position, le voyageur peut demander une excursion dans une destination nommée ou « autour de moi ». Le GPS n’est utilisé que si disponible et autorisé.

### G62 — Planner vérifié
Les nouveaux POI, coordonnées et sources sont validés côté serveur. L’ancien parcours ne devient jamais la destination implicite.

### G63 — Séparation simulation/réalité
Une position simulée n’est jamais restaurée comme GPS réel. Chaque nouvelle session réelle repart avec des capteurs inconnus jusqu’à une mesure effective.

### G64 — Guidage audiovisuel synchronisé
Le nom du lieu, la photographie, la consigne, la distance, la carte, la narration et l’AR reposent sur le même événement RoutePack.

### G65 — Arrivée fiable
L’arrivée nécessite plusieurs mesures suffisamment précises. Une position dégradée ne valide jamais une étape.

### G66 — Vision ponctuelle consentie
La caméra n’est jamais ouverte automatiquement. Une image personnelle n’est transmise à l’IA qu’après une action dédiée et une confirmation explicite.

### G67 — Geo-AR contextuelle
La vue AR s’ouvre depuis le compagnon, partage la position et l’orientation du moteur de guidage et se referme sans perdre la conversation.

### G68 — Simulation photographique
Le compagnon peut présenter, lire, mettre en pause, répéter et parcourir les scènes du RoutePack sans modifier sa progression réelle.

### G69 — Mémoire locale
Les itinéraires, progressions, médias et notes restent dans IndexedDB sur le téléphone. Aucune synchronisation cloud n’est automatique.

### G70 — Sauvegarde portable
L’export et l’import `.pocketguide` conservent le RoutePack, la progression, les photographies, les miniatures, les légendes, les coordonnées mesurées et les notes vocales.

### G71 — Continuité V1.8
Les données V1.8 stockées dans la bibliothèque locale restent lisibles et chargeables depuis la V2.

### G72 — Mode hors ligne
Un voyage téléchargé reste consultable et guidable sans OpenAI. Le compagnon annonce honnêtement la limitation sans bloquer l’application.

### G73 — Design ultra-premium
L’interface méditerranéenne privilégie la photographie, une présence lumineuse, une typographie éditoriale, peu de commandes simultanées et une utilisation à une main.

### G74 — Accessibilité
Les cibles tactiles mesurent au moins 44 px, les contrastes restent lisibles, les dialogues gèrent le focus, les états importants utilisent `aria-live` et `prefers-reduced-motion` est respecté.

### G75 — Confidentialité compréhensible
Les états micro, caméra, GPS et transmission d’image sont visibles en langage courant. L’interface ne laisse jamais croire qu’un capteur inactif observe le voyageur.

### G76 — PWA V2 indépendante
La V2 possède un manifeste qui démarre réellement la V2 et un cache versionné dédié. La V1.8 reste accessible séparément.

### G77 — Tolérance aux mises à jour
Une mise à jour du service worker ne mélange pas les versions et informe l’utilisateur lorsque le redémarrage est requis.

### G78 — Diagnostics utiles
Les erreurs Realtime, audio, GPS, caméra, Planner et stockage sont journalisées sans secret et traduites en action utilisateur claire.

### G79 — Simulation complète
La suite simule au minimum lancement, conversation locale, conversation Realtime factice, interruption, création et confirmation RoutePack, marche complète, AR, aperçu, photo locale, sauvegarde et restauration.

### G80 — Validation terrain
La publication finale exige un test Samsung Galaxy S22 couvrant microphone, haut-parleur, GPS, orientation, caméra, AR, veille/reprise, réseau faible et installation PWA.

## Modèles retenus

- Présence vocale continue : `gpt-realtime-2.1-mini`, effort de raisonnement faible par défaut.
- Questions touristiques complexes et Planner : `gpt-5.6-terra` côté serveur.
- Option d’évaluation premium : `gpt-realtime-2.1` sans modifier le contrat d’interface.

## Critère de sortie

La V2 n’est publiable que lorsque G53 à G79 sont automatisés ou simulés avec succès et que G80 possède une fiche de validation terrain signée. Une réussite des tests déterministes ne peut pas être présentée comme une validation du microphone, du GPS ou de la caméra physiques.
