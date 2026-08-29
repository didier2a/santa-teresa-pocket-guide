# V4 — Gate de parité PocketGuide 1.5.2

Version contrôlée : `4.0.0-preview.6`  
SDK Companion : `0.2.0`  
Principe média : boucle native V3 LiveAvatar + OpenAI Realtime, capacités V4 en parallèle.

| # | Capacité 1.5.2 | Implémentation V4 | Preuve automatisée |
|---:|---|---|---|
| 1 | Conversation native et interruption | Companion Provider → Controller → SDK, sans réinjection applicative | `companion-sdk.test.mjs` |
| 2 | RoutePack adaptatif | état persistant, prochaine étape, ciblage, raccourcissement | `pg4-v152-parity.test.mjs` |
| 3 | Protection des incontournables | `mustSee`, priorité, horaires fixes/verrouillés | `pg4-v152-parity.test.mjs` |
| 4 | GPS et carte | `TerrainAdapter` + Leaflet/OSM | `pg4-v152-parity.test.mjs`, contrat PWA |
| 5 | Geo-AR | caméra arrière, projection, boussole, réglage manuel ±15° | `pg4-v152-parity.test.mjs` |
| 6 | Permission orientation iOS | demande déclenchée depuis `pointerdown` | `pg4-v152-parity.test.mjs` |
| 7 | Orientation écran | 9:16 portrait, 16:9 paysage, session média conservée | `pg4-v152-parity.test.mjs` |
| 8 | Planner vérifié | schéma strict, coordonnées, dates/heures, sources HTTPS | `pg4-v152-parity.test.mjs` |
| 9 | Dictée Planner | SpeechRecognition + secours MediaRecorder `/api/transcribe` | `pg4-v152-parity.test.mjs` |
| 10 | Hors ligne | RoutePack, carte SVG, médias et noyau V4 en cache | `pg4-v152-parity.test.mjs` |
| 11 | Bibliothèque RoutePack | sauvegarde, import, export, ouverture, suppression | `pg4-v152-parity.test.mjs` |
| 12 | Réinitialisation capteurs | caméra, GPS, orientation et session micro réarmable | `companion-sdk.test.mjs` |
| 13 | Diagnostic universel | navigateur, capteurs, média, cache, SDK et orientation | `pg4-v152-parity.test.mjs` |
| 14 | Guide proactif | rayon, hystérésis de sortie, précision et cooldown | `pg4-v152-parity.test.mjs` |

## Résultat

- Gate V4/1.5.2 : **14/14**.
- Tests ciblés V4/Companion : **27/27**.
- Graphe des imports V4 : **30 modules, 0 import manquant**.
- Ressources PWA requises : **51 fichiers, 0 manquant**.
- Contrôle HTTP local : entrée HTML, CSS, bootstrap et gestionnaire d’orientation servis en `200`.

La validation matérielle reste distincte du gate de code : le volume réel, les permissions et deux tours de conversation doivent encore être vérifiés sur le Galaxy S22 depuis une preview HTTPS.
