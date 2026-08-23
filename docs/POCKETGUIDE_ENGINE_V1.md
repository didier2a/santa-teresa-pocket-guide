# PocketGuide Engine V1

PocketGuide Engine V1 transforme l'application Santa Teresa en moteur touristique générique sans modifier le comportement terrain validé de la V6.0.8.

## Principe

Le produit est séparé en trois couches :

1. **Engine** : exécution terrain (GPS, AR, navigation, planning, offline, audio, souvenir).
2. **RoutePack** : données d'un parcours touristique.
3. **Studio** : génération future d'un RoutePack depuis un prompt, un document ou un itinéraire existant.

## Règle de migration

Le moteur caméra/AR validé sur Galaxy S22 en V6.0.8 est gelé. La migration vers Engine V1 se fait d'abord par ajout d'un contrat RoutePack et d'un adaptateur de compatibilité. Aucun changement de comportement AR n'est requis pour ce jalon.

## RoutePack V1

Un RoutePack est un document JSON versionné. Il décrit au minimum :

- l'identité du parcours ;
- la timezone ;
- les jours et étapes ;
- les lieux et coordonnées ;
- les contraintes horaires ;
- les modes de transport ;
- les contenus de guide et d'audioguide ;
- les options AR ;
- les ressources offline.

Le contrat détaillé est défini par `engine/routepack-v1.schema.json`.

## Jalons

### V1.0 foundation

- schéma RoutePack V1 ;
- validateur déterministe ;
- chargeur générique ;
- adaptateur pour le `data/trip.json` historique ;
- tests de validation et de non-régression.

### V1.1 runtime

- sélection d'un RoutePack via URL/slug ;
- rendu de l'identité du voyage depuis le RoutePack ;
- migration progressive du planning et des POI.

### V1.2 share

- publication d'un RoutePack sous URL partageable ;
- QR code ;
- clonage et adaptation.

### V1.3 studio

- prompt -> RoutePack ;
- validation automatique ;
- rapport d'anomalies ;
- prévisualisation avant publication.

## Invariants

- Un RoutePack invalide ne doit jamais être exécuté silencieusement.
- Les transports/contraintes fixes sont protégés par le moteur déterministe.
- Les coordonnées hors plage sont bloquantes.
- Les identifiants doivent être uniques.
- Les étapes doivent référencer des lieux existants lorsqu'un `placeId` est fourni.
- L'IA prépare les données ; le validateur décide si elles sont exécutables.
