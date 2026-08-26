# PocketGuide V2.2 — cahier des charges audiovisuel unifié

## Intention produit

PocketGuide V2.2 présente une seule accompagnatrice humaine numérique, vocale et audiovisuelle. Terra prépare et vérifie, Realtime converse, le moteur GPS sécurise le guidage et les services médias/cartographiques enrichissent l’expérience. Ces moteurs restent invisibles : l’utilisateur retrouve partout la même personnalité, le même avatar et la voix `marin`.

La sécurité déterministe du guidage, le consentement progressif, la sauvegarde locale automatique, l’export-import complet et l’absence de transmission automatique des photos personnelles de la V1.8/V2.1 sont conservés.

## Architecture recommandée

- `CompanionOrchestrator` : point d’entrée unique pour conversation, préparation, narration, guidage et interruption.
- `PlanningStageEngine` : expose les étapes opérationnelles réelles, un statut lisible et une annulation par `AbortController`.
- `UnifiedAudioPack` : produit/lit la voix OpenAI `marin`, met les narrations en cache local et applique le mode hors ligne strict.
- `AvatarRuntime` : états prêt, écoute, réflexion et parole ; l’analyse du même flux audio pilote les visèmes.
- `MediaPackEngine` : enrichissement non bloquant Wikimedia/open data, provenance complète et progression par POI.
- `MapModeController` : OSM par défaut et adaptateurs Google chargés uniquement après un geste explicite.
- `WalkingGuidanceEngine` : couche locale déterministe prioritaire pour distance, direction, arrivée et sécurité.

## AudioPack et mode hors ligne

Chaque RoutePack peut référencer un `audioPack` versionné. Les clips sont stockés localement avec leur texte, leur voix, leur modèle, leur empreinte et leur Blob. L’export `.pocketguide` inclut les clips associés à l’itinéraire.

Le mode `strict` est le défaut : si un clip n’est pas en cache et que le réseau manque, le texte et un signal visuel restent disponibles, sans bascule silencieuse vers la voix Android. Le mode `continuité` est une préférence explicite et peut autoriser la synthèse du navigateur.

## MediaPack

Chaque média contient : `id`, `placeId`, `url`, `thumbnailUrl`, `source`, `sourceUrl`, `author`, `license`, `licenseUrl`, `attribution`, `alt`, `confidence`, `kind`, `cachePolicy` et `verifiedAt`.

Les images ouvertes (priorité Wikimedia Commons) peuvent être intégrées au stockage local dans le respect de leur licence. Les photos Google sont affichées en ligne à partir de références fraîches, avec attribution, et ne sont jamais archivées illégalement. Une illustration IA éventuelle porte toujours le libellé « Illustration IA ».

## Cartographie

OSM/Leaflet est la vue par défaut. Les vues Google Satellite, Street View et 3D photoréaliste sont des capacités optionnelles : chargement différé, consentement explicite, message de confidentialité/facturation, contrôle de couverture et repli automatique. La clé web Google doit être limitée aux référents de production, aux API strictement requises, avec quotas et alertes de facturation. Elle n’est jamais considérée comme un secret dans le client ; sa sécurité repose sur ces restrictions.

## Contrat d’acceptation G101–G120

- **G101** — L’avatar reste visible et adopte un état de réflexion immédiatement après une demande de préparation.
- **G102** — L’interface montre des étapes opérationnelles distinctes : compréhension, vérification Terra, construction, médias, voix et finalisation.
- **G103** — La préparation en cours peut être annulée ; le voyage actif reste intact. La demande peut ensuite être modifiée et relancée.
- **G104** — Realtime, Terra, GPS, simulation et textes internes parlent avec une personnalité unique et ne montrent aucun sélecteur « IA locale / IA distante ».
- **G105** — Toute synthèse vocale applicative utilise la voix `marin` et une configuration centrale.
- **G106** — Les narrations du parcours peuvent être préparées dans un AudioPack local hors ligne.
- **G107** — Le mode strict, actif par défaut, n’utilise pas `speechSynthesis` lorsque le clip `marin` manque.
- **G108** — Le flux audio réellement entendu est analysé par l’AudioBus et pilote les visèmes de l’avatar.
- **G109** — Le bouton d’interruption coupe immédiatement Realtime, TTS et animation labiale.
- **G110** — Tout nouveau RoutePack accepte un `mediaPack` versionné par POI.
- **G111** — Toute photo affichée expose provenance, attribution, licence, texte alternatif et confiance.
- **G112** — Les images validées apparaissent progressivement pendant la préparation et dans la proposition.
- **G113** — Une absence ou erreur d’image ne bloque jamais la création ni la confirmation du parcours.
- **G114** — Le voyage propose quatre modes : OSM, Satellite, Street View et 3D.
- **G115** — Aucun script, cookie ni requête Google n’est chargé avant l’action explicite de l’utilisateur.
- **G116** — Street View vérifie la couverture autour du POI et explique le repli si aucun panorama n’est disponible.
- **G117** — La 3D détecte l’incompatibilité ou l’absence de couverture et revient vers Satellite puis OSM.
- **G118** — La mise en production Google exige une clé dédiée restreinte par référent/API, des quotas et des alertes de facturation ; l’état de validation est visible dans le diagnostic.
- **G119** — Les attributions et règles de cache sont respectées ; les références Google Places/Street View ne sont ni exportées comme médias personnels ni mises en cache durablement.
- **G120** — La simulation automatise succès, hors ligne, annulation, photos absentes, Street View absent, 3D incompatible et interruption ; le procès-verbal final distingue cette simulation du test physique Galaxy S22.

## Critères de publication

Une V2.2 publique peut fonctionner sans Google grâce à OSM. Elle ne peut être déclarée « Google validé » tant que la clé dédiée, les restrictions, quotas, alertes, conditions de facturation et essais réels ne sont pas contrôlés. Le test physique Galaxy S22 reste un contrôle humain : permissions micro/GPS/caméra, écoute au haut-parleur et Bluetooth, latence, chauffe, batterie, verrouillage et reprise.
