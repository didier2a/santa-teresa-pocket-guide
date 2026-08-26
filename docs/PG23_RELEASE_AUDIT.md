# PocketGuide V2.3 RC — Audit de validation

Date : 26 août 2026

Version auditée : `2.3.0-rc1`

Entrée : `pocketguide-v23.html`

## Résultat

La V2.3 RC est **validée par simulation automatisée** et peut être publiée pour contre-test physique. Elle ne doit pas encore être qualifiée « Galaxy S22 validée » : cette mention dépend d’un contrôle visuel et sonore réel sur l’appareil cible.

## Défaut V2.2.1 identifié

L’animation interne des visèmes était testée, mais son résultat visuel ne l’était pas. Deux causes ont été confirmées :

- le CSS V2.2.1 appliquait `display:none` à la bouche en mode compact ;
- la bouche était positionnée par rapport au cadre extérieur alors que l’image `object-fit:contain` pouvait occuper une géométrie différente.

La V2.3 place désormais l’image et la bouche dans le même repère calculé. Le mode compact conserve explicitement le calque labial.

## Fonctions livrées

- avatar humain principal et persistant ;
- dix états de présence déterministes ;
- huit visèmes avec animation audio, transcription ou texte TTS ;
- laboratoire labial autonome, utilisable hors ligne ;
- détection `masqué`, `hors cadre`, `immobile`, `visible et mobile` ;
- fil vivant de treize catégories de scènes ;
- apparition progressive des réponses, itinéraires, photos, cartes, directions, arrivées et souvenirs ;
- suspension du défilement lors d’une action humaine avec reprise explicite ;
- raccordement aux moteurs existants Planner, MediaPack, AudioPack, RoutePack, GPS, aperçu, AR, bibliothèque et export/import ;
- stockage des voyages et photos personnelles uniquement sur le téléphone, sans transmission automatique ;
- nouvelle PWA et nouveau cache indépendants des versions précédentes.

## Validation exécutée

| Contrôle | Résultat |
|---|---:|
| Critères G121 à G150 présents | 30 / 30 |
| Contrats et simulations V2.3 | 31 / 31 |
| Scénarios V2.3 détaillés | 23 / 23 |
| Régression totale V1.5 → V2.2 incluse | 269 / 269 |
| Identifiants HTML dupliqués | 0 |
| Ressources locales référencées manquantes | 0 |
| Erreurs de syntaxe des modules V2.3 | 0 |
| Erreurs `git diff --check` | 0 |

## Contre-test physique obligatoire

Sur le Galaxy S22 :

1. ouvrir V2.3 et choisir **Actions → Tester le visage** ;
2. lancer **Tester sans la voix** et vérifier visuellement les huit changements ;
3. lancer **Tester une phrase** ;
4. lancer **Tester avec marin** et vérifier la cohérence voix/bouche ;
5. fermer le laboratoire, parler normalement à la guide et vérifier les modes principal puis compact ;
6. confirmer que l’interruption neutralise immédiatement la voix et la bouche.

Le laboratoire doit afficher `Visible et mobile`. Ce verdict technique ne remplace pas l’observation humaine : les lèvres doivent également être correctement superposées au visage.

## Décision

Statut de livraison : **RC publiable**.

Statut G150 : **automatisation réussie, contre-test Galaxy S22 en attente**.
