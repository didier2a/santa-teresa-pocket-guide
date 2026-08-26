import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {PRESENCE_STATES,visibilityVerdict} from '../js/pg23/avatar/living-avatar-runtime.js';
import {SCENE_TYPES} from '../js/pg23/scenes/living-scene-engine.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [spec,html,css,manifestText,sw,avatar,scenes,scroll,runtime]=await Promise.all([
  read('docs/PG23_LIVING_COMPANION_TECHNICAL_SPEC.md'),read('pocketguide-v23.html'),read('pocketguide-v23.css'),read('manifest-v23.webmanifest'),read('service-worker.js'),read('js/pg23/avatar/living-avatar-runtime.js'),read('js/pg23/scenes/living-scene-engine.js'),read('js/pg23/scenes/scroll-director.js'),read('js/pg23/bootstrap/living-companion-runtime.js')
]);

test('V2.3 formalise chaque critère bloquant G121 à G150',()=>{for(let gate=121;gate<=150;gate+=1)assert.match(spec,new RegExp(`G${gate}\\b`),`G${gate}`);});

test('V2.3 est une PWA indépendante, versionnée et mise en cache',()=>{const manifest=JSON.parse(manifestText);assert.match(manifest.start_url,/pocketguide-v23\.html/);assert.match(html,/data-pg-version="2\.3\.0-rc1"/);assert.match(sw,/APP_VERSION='8\.3\.0'/);assert.match(sw,/PG23_CACHE='pocketguide-v23-living-companion-rc1'/);for(const asset of ['pocketguide-v23.html','pocketguide-v23.css','manifest-v23.webmanifest','living-avatar-runtime.js','living-scene-engine.js','scroll-director.js'])assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));});

test('les fonctions héritées V1.8 et V2.2 restent présentes dans la coque',()=>{for(const id of ['companionMic','stopCompanion','simulateJourney','startGps','mapModeBar','openAr','captureMemory','importJourney','journeyLibrary','plannerDialog','proposalDialog','photoDialog','remoteAudio','guideAudio'])assert.match(html,new RegExp(`id="${id}"`),id);for(const mode of ['osm','satellite','street','3d'])assert.match(html,new RegExp(`data-map-mode="${mode}"`));});

test('l’avatar principal possède dix états déterministes et un repère commun image-bouche',()=>{assert.equal(PRESENCE_STATES.length,10);assert.deepEqual(PRESENCE_STATES,['ready','listening','thinking','speaking','presenting','walking','arrived','interrupted','degraded','error']);for(const id of ['humanGuide','avatarPortrait','avatarMouth'])assert.match(html,new RegExp(`id="${id}"`));assert.match(css,/\.avatar-portrait/);assert.match(css,/\.avatar-mouth\{[^}]*display:block!important/);assert.match(css,/data-portrait="compact"[^}]*human-guide/);assert.doesNotMatch(css,/data-portrait="compact"[^}]*avatar-mouth[^}]*display\s*:\s*none/);});

test('le laboratoire autonome couvre huit visèmes et refuse les faux succès',async()=>{for(const id of ['lipSyncLabDialog','labAvatar','labAvatarPortrait','labAvatarMouth','labVerdict','labViseme','labChanges','labVisibility','testSilentLips','testFrenchLips','testMarinLips'])assert.match(html,new RegExp(`id="${id}"`),id);assert.match(avatar,/runSilent\(\)/);assert.match(avatar,/ACTIVE_VISEMES\.slice/);for(const code of ['hidden','out-of-frame','still','visible'])assert.match(avatar,new RegExp(`code:'${code}'`));assert.equal(visibilityVerdict({display:'none'}).code,'hidden');const image=await stat(new URL('../assets/companion/human-guide-visemes-v22.png',import.meta.url));assert.ok(image.size>100_000);});

test('le fil vivant supporte toutes les scènes normatives, la persistance et la reprise humaine',()=>{assert.equal(SCENE_TYPES.length,13);for(const type of ['speech','thinking','route','media','poi','map','direction','arrival','preview','memory','consent','continuity','error'])assert.ok(SCENE_TYPES.includes(type));for(const id of ['livingFlow','sceneStream','sceneCount','resumeScenes'])assert.match(html,new RegExp(`id="${id}"`));assert.match(scenes,/clearEphemeral/);assert.match(scenes,/this\.ids\.get/);assert.match(scroll,/human-interaction/);assert.match(scroll,/dialog-open/);assert.match(scroll,/reduced-motion/);});

test('les moteurs réels Planner, média, GPS, mémoire et aperçu alimentent les scènes',()=>{for(const event of ['pg22.planning.stage','pg22.media.progress','proposal.created','guidance.snapshot','media.personal.saved','network.offline','companion.realtime.error'])assert.match(runtime,new RegExp(event.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.match(runtime,/createRouteScene/);assert.match(runtime,/installPreviewHook/);assert.match(runtime,/deterministic-gps/);});

test('accessibilité, vie privée et limites des fournisseurs restent explicites',()=>{assert.match(html,/aria-live="polite"/);assert.match(html,/Rien n’est envoyé automatiquement/);assert.match(html,/contacte Google Maps/);assert.match(css,/min-height:48px/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(spec,/Galaxy S22 validé.*interdite/i);assert.match(runtime,/version:'2\.3\.0-rc1'/);assert.doesNotMatch(runtime,/api[_-]?key\s*[:=]/i);});
