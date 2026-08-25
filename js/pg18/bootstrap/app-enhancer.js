import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';
import {actionRegistry} from '../../pg16/core/action-registry.js';
import {voiceController} from '../../pg16/guide/voice-controller.js';
import {enrichRoutePackMedia} from '../../route-media.js';
import {V51_PHOTO_MAP} from '../../trip-config.js?v=1.8.0rc4';
import {itineraryStore} from '../storage/itinerary-store.js';
import {itineraryManager} from '../itineraries/itinerary-manager.js';
import {createPortableBackupBlob,backupFilename,downloadPortableBackup,importPortableBundle} from '../backup/portable-backup.js';
import {savePersonalPhoto,captureVideoFrame,LocalVoiceNoteRecorder} from '../media/photo-capture.js';
import {audiovisualJournal} from '../journal/audiovisual-journal.js';
import {photoPreviewEngine,MODES} from '../simulation/photo-preview-engine.js';

const $=selector=>document.querySelector(selector);
const params=new URL(location.href).searchParams;
const technicalPreview=params.get('photosim')==='1';
let includeArchived=false,previewItineraryId=null,previewVoice=true,pendingPhoto=null,pendingPhotoUrl=null,pendingVoiceNote=null,previewObjectUrl=null,viewerObjectUrl=null,viewerVoiceUrl=null,viewerMedia=null,libraryRenderToken=0;
const journalUrls=[];
const voiceRecorder=new LocalVoiceNoteRecorder();

function waitForBase(timeoutMs=15_000){const started=Date.now();return new Promise((resolve,reject)=>{const poll=()=>{if(globalThis.__POCKETGUIDE_17__)resolve(globalThis.__POCKETGUIDE_17__);else if(Date.now()-started>timeoutMs)reject(new Error('PocketGuide 1.7 base indisponible'));else setTimeout(poll,50);};poll();});}
function setText(selector,value){const target=$(selector);if(target)target.textContent=value??'—';}
function esc(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function safeCssUrl(value=''){return `url(${JSON.stringify(String(value))})`;}
function formatDate(value){if(!value)return'—';try{return new Date(value).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});}catch{return'—';}}
function formatBytes(value){const bytes=Number(value)||0;if(bytes<1024)return`${bytes} o`;if(bytes<1024**2)return`${(bytes/1024).toFixed(1)} Ko`;return`${(bytes/1024**2).toFixed(1)} Mo`;}
function statusLabel(status){return ({planned:'Planifié',in_progress:'En cours',completed:'Terminé',archived:'Archivé'})[status]||status||'Planifié';}
function routeEvents(){return (pocketGuideState.select('route.pack.days')||[]).flatMap(day=>day.events||[]);}
function eventName(eventId){const event=routeEvents().find(item=>item.id===eventId),place=(pocketGuideState.select('route.pack.places')||[]).find(item=>item.id===event?.placeId);return place?.name||event?.title||'ce lieu';}
function currentId(){return itineraryManager.currentId();}
function openPanel(panel){pocketGuideState.patch({ui:{panel}},{source:'pg18-ui',event:'ui.panel.changed'});}
function showDialog(dialog){if(!dialog)return;if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');}
function closeDialog(dialog){if(!dialog)return;if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');}
function updateIdentity(){if(!pocketGuideState.select('ui.ar'))setText('#modeBadge','GUIDE TOURISTIQUE');}

async function warmRouteImages(pack){
  if(!globalThis.caches||!pocketGuideState.select('device.online'))return;const cache=await caches.open('pocketguide-v18-route-media');
  const urls=(pack?.places||[]).map(place=>place?.heroImage||place?.media?.[0]?.url).filter(url=>/^https:\/\//.test(url||''));
  await Promise.allSettled(urls.map(async url=>{if(await cache.match(url))return;const response=await fetch(url);if(response.ok)await cache.put(url,response.clone());}));
}
async function ensurePreviewMedia(itinerary){
  const santaTeresa=itinerary?.title==='Santa Teresa Pocket Guide';
  const canonicalPlace=place=>{const photo=santaTeresa?V51_PHOTO_MAP[place?.id]:null;if(!photo)return place;const media={url:photo.image,originalUrl:photo.image,descriptionUrl:photo.page||'',title:photo.label,author:photo.credit||'',license:'',credit:photo.credit||'',source:photo.page?'Wikimedia Commons':'PocketGuide'};return {...place,heroImage:photo.image,media:[media],photoExact:photo.exact,photoLabel:photo.label,imageAttribution:{source:media.source,author:media.author,license:media.license,descriptionUrl:media.descriptionUrl}};};
  const canonicalPlaces=(itinerary?.routePack?.places||[]).map(canonicalPlace);
  const canonicalChanged=canonicalPlaces.some((place,index)=>place.heroImage!==(itinerary?.routePack?.places||[])[index]?.heroImage);
  if(canonicalChanged)itinerary.routePack={...itinerary.routePack,places:canonicalPlaces};
  const needs=canonicalChanged||canonicalPlaces.some(place=>!place?.media?.length||(!/^https:\/\//.test(place?.heroImage||'')&&!(santaTeresa&&V51_PHOTO_MAP[place?.id]?.image===place?.heroImage)));
  if(!needs||!pocketGuideState.select('device.online')){await warmRouteImages(itinerary.routePack);return itinerary;}
  setText('#pg18LibraryStatus','Préparation et mise en cache des photographies du parcours…');
  let routePack=await enrichRoutePackMedia(itinerary.routePack,{destination:itinerary.title});
  const places=[];for(const sourcePlace of routePack.places||[]){const place=canonicalPlace(sourcePlace);let heroImage=place.heroImage||'';if(heroImage&&!/^https:\/\//.test(heroImage)){try{const response=await fetch(heroImage,{method:'HEAD',cache:'no-store'});if(!response.ok)heroImage=place.media?.[0]?.url||'';}catch{heroImage=place.media?.[0]?.url||'';}}if(!heroImage)heroImage=place.media?.[0]?.url||'';places.push({...place,heroImage});}routePack={...routePack,places};
  itinerary.routePack=routePack;itinerary.routeFingerprint=JSON.stringify(routePack);itinerary.revision=Math.max(1,Number(itinerary.revision)||1)+1;itinerary.updatedAt=new Date().toISOString();itinerary.cover=routePack.places?.find(place=>place.heroImage)?.heroImage||itinerary.cover;await itineraryStore.saveItinerary(itinerary);
  if(currentId()===itinerary.id)pocketGuideState.patch({route:{pack:routePack}},{source:'pg18-media',event:'route.media.enriched'});
  await warmRouteImages(routePack);setText('#pg18LibraryStatus','Photographies du parcours prêtes pour la consultation hors ligne.');return itinerary;
}

function itineraryCard(item){const cover=item.cover?`--cover:${safeCssUrl(item.cover)}`:'';return `<article class="pg18-itinerary" data-itinerary-id="${esc(item.id)}"><div class="pg18-itinerary-cover" style="${esc(cover)}"><div><h3>${esc(item.label||item.title)}</h3><small>${esc(item.title)} · ${formatDate(item.updatedAt)}</small></div></div><div class="pg18-itinerary-body"><div class="pg18-itinerary-meta"><span>${statusLabel(item.status)}</span><span>${item.stats?.poiCount||0} POI</span><span>${item.stats?.mediaCount||0} photo${item.stats?.mediaCount>1?'s':''}</span><span>Révision ${item.revision||1}</span></div><div class="pg18-itinerary-actions"><button class="primary" data-library-action="load">${item.status==='in_progress'?'Reprendre':'Ouvrir'}</button><button class="ghost" data-library-action="restart">Repartir du début</button><button class="ghost" data-library-action="preview">▶ Simuler</button><button class="ghost" data-library-action="journal">▦ Carnet</button><button class="ghost" data-library-action="export">⇩ Exporter</button><button class="ghost" data-library-action="rename">Renommer</button><button class="ghost" data-library-action="duplicate">Dupliquer</button><button class="ghost" data-library-action="archive">${item.status==='archived'?'Restaurer':'Archiver'}</button><button class="ghost" data-library-action="delete">Supprimer</button></div></div></article>`;}

async function renderStorage(){const {usage,quota}=await itineraryStore.storageEstimate();setText('#pg18Storage',quota?`Stockage PocketGuide et navigateur : ${formatBytes(usage)} utilisés sur ${formatBytes(quota)} disponibles.`:'Stockage local disponible. Le quota exact n’est pas communiqué par ce navigateur.');}
async function renderLibrary(message=''){
  const token=++libraryRenderToken;try{const items=await itineraryManager.list({includeArchived});if(token!==libraryRenderToken)return;$('#pg18LibraryList').innerHTML=items.length?items.map(itineraryCard).join(''):'<p class="pg18-status">Aucun itinéraire sauvegardé. Créez un parcours avec le Planner.</p>';setText('#pg18LibraryStatus',message||`${items.length} itinéraire${items.length>1?'s':''} disponible${items.length>1?'s':''} hors ligne.`);await renderStorage();}catch(error){setText('#pg18LibraryStatus',`Stockage local indisponible : ${error.message}`);}
}

function revokePreviewUrl(){if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null;}}
function renderPreviewScene(scene,{repeat=false}={}){
  if(!scene)return;revokePreviewUrl();let image=scene.imageUrl||null;if(scene.kind==='personal'&&scene.blob){previewObjectUrl=URL.createObjectURL(scene.blob);image=previewObjectUrl;}const media=$('#pg18PreviewMedia');if(media)media.style.setProperty('--preview',image?safeCssUrl(image):'linear-gradient(135deg,#145966,#0a2429)');setText('#pg18PreviewProvenance',scene.provenance);setText('#pg18PreviewPlace',scene.title);setText('#pg18PreviewStory',scene.story||scene.narration);setText('#pg18PreviewLeg',scene.distanceMeters==null?'Distance non mesurée':scene.sceneIndex===0?'Départ':`${scene.distanceMeters} m · environ ${scene.walkingMinutes} min`);setText('#pg18PreviewCount',`${scene.sceneIndex+1} / ${scene.totalScenes}`);const bar=$('#pg18PreviewProgress');if(bar)bar.style.width=`${Math.round(scene.progress*100)}%`;if(previewVoice&&(repeat||photoPreviewEngine.running))voiceController.speak(scene.narration);
}
function renderPreviewStatus(payload){if(!payload)return;const play=$('#pg18PreviewPlay');if(play)play.textContent=payload.status==='running'?'Pause':'▶ Lecture';}
async function openPreview(id=currentId(),mode=$('#pg18PreviewMode')?.value||MODES.PREPARATORY){
  if(!id){setText('#pg18LibraryStatus','Créez ou chargez d’abord un itinéraire.');openPanel('library');return;}
  await itineraryManager.flush().catch(()=>null);let itinerary=await itineraryStore.getItinerary(id);if(!itinerary)throw new Error('Itinéraire local introuvable.');itinerary=await ensurePreviewMedia(itinerary);const media=await itineraryStore.listMedia(id);previewItineraryId=id;$('#pg18PreviewMode').value=mode;const scenes=photoPreviewEngine.load({itinerary,media,mode});setText('#pg18PreviewTitle',itinerary.label||itinerary.title);showDialog($('#pg18PreviewDialog'));if(!scenes.length){setText('#pg18PreviewPlace','Aucune image dans cette version');setText('#pg18PreviewStory',mode===MODES.SOUVENIR?'Prenez des photos pendant la visite ou choisissez la version préparatoire.':'Aucune scène disponible.');}else renderPreviewScene(scenes[0]);
}
async function reloadPreview(){if(previewItineraryId)await openPreview(previewItineraryId,$('#pg18PreviewMode').value);}

function revokeJournalUrls(){while(journalUrls.length)URL.revokeObjectURL(journalUrls.pop());}
async function openJournal(id=currentId()){
  if(!id)return;const {itinerary,entries}=await audiovisualJournal.load(id);revokeJournalUrls();const html=entries.map(entry=>{let image=entry.imageUrl||'';if(entry.kind==='personal'&&entry.thumbnail){image=URL.createObjectURL(entry.thumbnail);journalUrls.push(image);}const media=image?`<img src="${esc(image)}" alt="${esc(entry.title)}">`:'<div class="pg18-journal-image"></div>';return `<article class="pg18-journal-entry">${media}<div><h4>${esc(entry.title)}</h4><p>${entry.kind==='personal'?`Photo personnelle · ${formatDate(entry.capturedAt)}`:'Photographie du RoutePack'}</p><p>${esc(entry.story||'')}</p></div>${entry.kind==='personal'?`<button class="ghost" data-view-media="${esc(entry.mediaId)}">Ouvrir la photo interactive</button>`:''}</article>`;}).join('');setText('#pg18JournalTitle',itinerary.label||itinerary.title);$('#pg18JournalList').innerHTML=html||'<p>Aucun souvenir disponible.</p>';$('#pg18Journal').hidden=false;openPanel('library');
}

async function exportItinerary(id){const item=await itineraryStore.getItinerary(id),blob=await createPortableBackupBlob(id);downloadPortableBackup(blob,backupFilename(item));setText('#pg18LibraryStatus',`Sauvegarde exportée : ${backupFilename(item)}`);}
async function handleLibraryAction(button){const card=button.closest('[data-itinerary-id]'),id=card?.dataset.itineraryId,action=button.dataset.libraryAction;if(!id)return;try{
  if(action==='load'){await itineraryManager.load(id);openPanel('guide');setText('#guideAnswer','Itinéraire local chargé. Le guide est prêt à reprendre.');}
  if(action==='restart'&&confirm('Recommencer cet itinéraire depuis sa première étape ? Les photos du carnet seront conservées.')){await itineraryManager.load(id,{restart:true});openPanel('guide');setText('#guideAnswer','Itinéraire repris depuis sa première étape. Vos souvenirs sont conservés.');}
  if(action==='preview')await openPreview(id);
  if(action==='journal')await openJournal(id);
  if(action==='export')await exportItinerary(id);
  if(action==='rename'){const item=await itineraryStore.getItinerary(id),label=prompt('Nouveau nom de l’itinéraire :',item?.label||item?.title||'');if(label)await itineraryManager.rename(id,label);}
  if(action==='duplicate')await itineraryManager.duplicate(id);
  if(action==='archive'){const item=await itineraryStore.getItinerary(id);await itineraryManager.archive(id,item?.status!=='archived');}
  if(action==='delete'&&confirm('Supprimer définitivement cet itinéraire et toutes ses photos locales ?'))await itineraryManager.delete(id);
  await renderLibrary();
 }catch(error){setText('#pg18LibraryStatus',`Action impossible : ${error.message}`);}}

function locationSummary(){const location=pocketGuideState.select('location');if(!Number.isFinite(location?.lat)||!Number.isFinite(location?.lng))return'Photo enregistrable sans position GPS mesurée.';return `Position mesurée : ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}${Number.isFinite(location.accuracy)?` · précision ±${Math.round(location.accuracy)} m`:''}`;}
function cleanupPendingPhoto(){if(pendingPhotoUrl)URL.revokeObjectURL(pendingPhotoUrl);pendingPhotoUrl=null;pendingPhoto=null;pendingVoiceNote=null;voiceRecorder.cancel();setText('#pg18VoiceNoteStatus','Aucune note');}
function preparePhoto(blob){cleanupPendingPhoto();pendingPhoto=blob;pendingPhotoUrl=URL.createObjectURL(blob);$('#pg18PhotoPreview').src=pendingPhotoUrl;$('#pg18PhotoCaption').value='';setText('#pg18PhotoLocation',locationSummary());showDialog($('#pg18PhotoDialog'));}
async function requestPhoto(){const video=$('#arCamera');try{if(pocketGuideState.select('ui.ar')&&video?.readyState>=2)preparePhoto(await captureVideoFrame(video));else $('#pg18PhotoInput').click();}catch(error){setText('#guideAnswer',`Caméra indisponible : ${error.message}`);}}
async function savePendingPhoto(){if(!pendingPhoto)return;const button=$('#pg18PhotoSave');button.disabled=true;try{const record=await savePersonalPhoto(pendingPhoto,{itineraryId:currentId(),association:$('#pg18PhotoAssociation').value,caption:$('#pg18PhotoCaption').value,voiceNote:pendingVoiceNote});closeDialog($('#pg18PhotoDialog'));cleanupPendingPhoto();setText('#guideAnswer',`Photo enregistrée localement pour ${eventName(record.eventId)}.`);await renderLibrary('Photo ajoutée au carnet audiovisuel.');}catch(error){setText('#pg18PhotoLocation',`Enregistrement impossible : ${error.message}`);}finally{button.disabled=false;}}
async function toggleVoiceNote(){const button=$('#pg18VoiceNote');if(voiceRecorder.recorder){pendingVoiceNote=await voiceRecorder.stop();button.textContent='🎙️ Remplacer la note vocale';setText('#pg18VoiceNoteStatus',`Note locale · ${formatBytes(pendingVoiceNote.size)}`);return;}try{await voiceRecorder.start();button.textContent='■ Terminer la note';setText('#pg18VoiceNoteStatus','Enregistrement local en cours…');}catch(error){setText('#pg18VoiceNoteStatus',error.message);}}

async function openPhotoViewer(mediaId){const item=await itineraryStore.getMedia(mediaId);if(!item)return;viewerMedia=item;if(viewerObjectUrl)URL.revokeObjectURL(viewerObjectUrl);if(viewerVoiceUrl)URL.revokeObjectURL(viewerVoiceUrl);viewerObjectUrl=URL.createObjectURL(item.blob);$('#pg18ViewerImage').src=viewerObjectUrl;const voice=$('#pg18ViewerVoice');if(item.voiceNote){viewerVoiceUrl=URL.createObjectURL(item.voiceNote);voice.src=viewerVoiceUrl;voice.hidden=false;}else{voice.removeAttribute('src');voice.hidden=true;}setText('#pg18ViewerTitle',item.caption||eventName(item.eventId));const loc=item.location||{};setText('#pg18ViewerMeta',`${formatDate(item.capturedAt)} · ${item.association?.type==='segment'?'Entre deux étapes':'POI associé'}${Number.isFinite(loc.lat)?` · GPS ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}${Number.isFinite(loc.accuracy)?` ±${Math.round(loc.accuracy)} m`:''}`:' · sans GPS mesuré'}`);setText('#pg18ViewerCaption',item.caption||'Aucune légende.');showDialog($('#pg18PhotoViewer'));}

const base=await waitForBase();
if(!actionRegistry.has('ui.open_library'))actionRegistry.register('ui.open_library',{description:'Ouvrir la bibliothèque locale.',handler:()=>{openPanel('library');return {panel:'library'};}});
pocketGuideState.patch({version:'1.8.0-rc1'},{source:'pg18-bootstrap',event:'app.v18.ready'});updateIdentity();
photoPreviewEngine.onScene=renderPreviewScene;photoPreviewEngine.onStatus=renderPreviewStatus;itineraryManager.onStatus=payload=>{if(payload.type==='error')setText('#pg18LibraryStatus',payload.message);};itineraryManager.start();

$('#pg18LibraryList')?.addEventListener('click',event=>{const button=event.target.closest('[data-library-action]');if(button)handleLibraryAction(button);});
$('#pg18RefreshLibrary')?.addEventListener('click',()=>renderLibrary());$('#pg18ShowArchived')?.addEventListener('click',event=>{includeArchived=!includeArchived;event.currentTarget.setAttribute('aria-pressed',String(includeArchived));event.currentTarget.textContent=includeArchived?'Masquer les archives':'Voir les archives';renderLibrary();});
$('#pg18SaveNow')?.addEventListener('click',async()=>{await itineraryManager.flush();await renderLibrary('Itinéraire sauvegardé sur ce téléphone.');});$('#pg18OpenJournal')?.addEventListener('click',()=>openJournal());$('#pg18CloseJournal')?.addEventListener('click',()=>{$('#pg18Journal').hidden=true;revokeJournalUrls();});
$('#pg18JournalList')?.addEventListener('click',event=>{const button=event.target.closest('[data-view-media]');if(button)openPhotoViewer(button.dataset.viewMedia);});
$('#pg18SimulateCurrent')?.addEventListener('click',()=>openPreview());$('#pg18SimulateFromPlanner')?.addEventListener('click',()=>openPreview());
$('#pg18PreviewClose')?.addEventListener('click',()=>{photoPreviewEngine.pause();voiceController.interrupt();revokePreviewUrl();closeDialog($('#pg18PreviewDialog'));});$('#pg18PreviewPlay')?.addEventListener('click',()=>photoPreviewEngine.running?photoPreviewEngine.pause():photoPreviewEngine.play());$('#pg18PreviewPrevious')?.addEventListener('click',()=>photoPreviewEngine.previous());$('#pg18PreviewNext')?.addEventListener('click',()=>photoPreviewEngine.next());$('#pg18PreviewRepeat')?.addEventListener('click',()=>photoPreviewEngine.repeat());$('#pg18PreviewMute')?.addEventListener('click',event=>{previewVoice=!previewVoice;event.currentTarget.setAttribute('aria-pressed',String(!previewVoice));event.currentTarget.textContent=previewVoice?'🔊 Voix':'🔇 Muet';if(!previewVoice)voiceController.interrupt();});$('#pg18PreviewMode')?.addEventListener('change',reloadPreview);
$('#pg18Capture')?.addEventListener('click',requestPhoto);$('#pg18CaptureHero')?.addEventListener('click',requestPhoto);$('#pg18PhotoInput')?.addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)preparePhoto(file);});$('#pg18PhotoSave')?.addEventListener('click',savePendingPhoto);$('#pg18VoiceNote')?.addEventListener('click',toggleVoiceNote);$('#pg18PhotoDialog')?.addEventListener('close',()=>{if(!pendingPhoto)return;cleanupPendingPhoto();});
$('#pg18Import')?.addEventListener('click',()=>$('#pg18ImportInput').click());$('#pg18ImportInput')?.addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const result=await importPortableBundle(file);await renderLibrary(`Sauvegarde importée : ${result.itinerary.label||result.itinerary.title}`);}catch(error){setText('#pg18LibraryStatus',`Import impossible : ${error.message}`);}});
$('#pg18ViewerClose')?.addEventListener('click',()=>closeDialog($('#pg18PhotoViewer')));$('#pg18ViewerAsk')?.addEventListener('click',()=>{if(!viewerMedia)return;const place=eventName(viewerMedia.eventId),caption=viewerMedia.caption?` Ma note était : « ${viewerMedia.caption} ».`:'';closeDialog($('#pg18PhotoViewer'));openPanel('guide');base.submitText?.(`Parle-moi du lieu ${place} associé à cette photo personnelle.${caption}`,{source:'pg18-personal-photo'});});
$('#pg18ViewerFocus')?.addEventListener('click',async()=>{if(!viewerMedia)return;if(currentId()!==viewerMedia.itineraryId)await itineraryManager.load(viewerMedia.itineraryId);pocketGuideState.patch({conversation:{currentPlaceId:viewerMedia.poiId||null,lastMentionedPlaceId:viewerMedia.poiId||null}},{source:'pg18-personal-photo',event:'conversation.focus.changed'});closeDialog($('#pg18PhotoViewer'));openPanel('route');});
$('#pg18ViewerDelete')?.addEventListener('click',async()=>{if(!viewerMedia||!confirm('Supprimer définitivement cette photo et sa note vocale locale ?'))return;const itineraryId=viewerMedia.itineraryId;await itineraryStore.deleteMedia(viewerMedia.id);await itineraryManager.mediaSaved(itineraryId);viewerMedia=null;closeDialog($('#pg18PhotoViewer'));await renderLibrary('Photo personnelle supprimée.');await openJournal(itineraryId);});
eventBus.on('route.replaced',()=>renderLibrary('Nouveau parcours sauvegardé automatiquement.'));eventBus.on('route.completed',()=>renderLibrary('Parcours terminé et carnet mis à jour.'));eventBus.on('ui.panel.changed',payload=>{if(payload?.after?.ui?.panel==='library'||pocketGuideState.select('ui.panel')==='library')renderLibrary();});eventBus.on('*',updateIdentity);
await itineraryManager.flush().catch(error=>setText('#pg18LibraryStatus',error.message));await renderLibrary();
if(technicalPreview)await openPreview(currentId());
globalThis.__POCKETGUIDE_18__={...base,store:itineraryStore,itineraries:itineraryManager,preview:photoPreviewEngine,journal:audiovisualJournal,openPreview,openJournal};
eventBus.emit('app.v18.enhanced',{version:'1.8.0-rc1'});
