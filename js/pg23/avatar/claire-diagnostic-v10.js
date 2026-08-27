import {ClaireThreeStage,captureNativePose,restoreNativePose} from './claire-three-stage.js';

const THREE_URL=new URL('../../../vendor/avatar-local/three-0.180.0/build/three.module.min.js',import.meta.url).href;
const GLTF_LOADER_URL=new URL('../../../vendor/avatar-local/three-0.180.0/addons/loaders/GLTFLoader.js',import.meta.url).href;
const MESHOPT_URL=new URL('../../../vendor/avatar-local/three-0.180.0/addons/libs/meshopt_decoder.module.js',import.meta.url).href;
const TALKING_HEAD_URL=new URL('../../../vendor/avatar-local/talkinghead-1.7.0/talkinghead.mjs',import.meta.url).href;
const MODEL_URL=new URL('../../../assets/avatar-local/models/claire-rocketbox.glb',import.meta.url).href;
const EXPECTED_MODEL_HASH='a869cc38a324e6fdec6b089bd47e60bee3112065c69e715190cd820c14c64539';
const REQUIRED_BONES=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftEye','RightEye','LeftShoulder','RightShoulder','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand','LeftToeBase','RightToeBase'];
const $=selector=>document.querySelector(selector),steps=$('#steps'),report=$('#report'),verdict=$('#verdict'),results={revision:'v11-portrait',architecture:'three-renderer+native-pose+talkinghead-face',startedAt:new Date().toISOString(),userAgent:navigator.userAgent,devicePixelRatio:devicePixelRatio||1,steps:[]};
let activeStage='initialisation';

function renderReport(){report.textContent=JSON.stringify(results,null,2);}
function addStep(label,state,detail){const entry={label,state,detail:String(detail||'')};results.steps.push(entry);const li=document.createElement('li');li.dataset.state=state;li.innerHTML=`<i>${state==='pass'?'✓':state==='fail'?'!':'…'}</i><span><strong>${label}</strong><small>${entry.detail}</small></span>`;steps.append(li);renderReport();return entry;}
function fail(label,error){const message=String(error?.message||error);addStep(label,'fail',message);results.failedStage=activeStage;results.error={name:error?.name||'Error',message,stack:String(error?.stack||'').slice(0,1600)};verdict.dataset.state='fail';verdict.innerHTML=`<strong>Claire ne peut pas encore être affichée</strong><span>${activeStage} : ${message}</span>`;renderReport();}
function frame(){return new Promise(resolve=>requestAnimationFrame(()=>resolve()));}
async function sha256(buffer){const hash=await crypto.subtle.digest('SHA-256',buffer.slice(0));return[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');}
function makeStage(THREE,host,modelFPS=20){const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:true,antialias:false,powerPreference:'low-power',failIfMajorPerformanceCaveat:false});if(!gl)throw new Error('WebGL2 a refusé la création du canvas');return new ClaireThreeStage({THREE,host,canvas,context:gl,pixelRatio:1,modelFPS,view:'portrait'});}

addEventListener('error',event=>{results.browserError=String(event.error?.message||event.message||'Erreur navigateur');renderReport();});
addEventListener('unhandledrejection',event=>{results.unhandledRejection=String(event.reason?.message||event.reason||'Promesse rejetée');renderReport();});

try{
  activeStage='WebGL2';
  const probe=document.createElement('canvas'),probeGl=probe.getContext('webgl2',{failIfMajorPerformanceCaveat:false});if(!probeGl)throw new Error('Contexte WebGL2 indisponible');const debug=probeGl.getExtension('WEBGL_debug_renderer_info');results.webgl={version:probeGl.getParameter(probeGl.VERSION),vendor:debug?probeGl.getParameter(debug.UNMASKED_VENDOR_WEBGL):probeGl.getParameter(probeGl.VENDOR),renderer:debug?probeGl.getParameter(debug.UNMASKED_RENDERER_WEBGL):probeGl.getParameter(probeGl.RENDERER)};probeGl.getExtension('WEBGL_lose_context')?.loseContext();addStep('WebGL2 matériel','pass',`${results.webgl.renderer} · ${results.webgl.version}`);

  activeStage='Modules Three.js';
  const [THREE,{GLTFLoader},{MeshoptDecoder}]=await Promise.all([import(THREE_URL),import(GLTF_LOADER_URL),import(MESHOPT_URL)]);await MeshoptDecoder.ready;results.threeRevision=THREE.REVISION;addStep('Three.js et Meshopt','pass',`Three r${THREE.REVISION} · décodeur prêt`);

  activeStage='Téléchargement GLB';
  const response=await fetch(MODEL_URL,{cache:'reload'});if(!response.ok)throw new Error(`HTTP ${response.status} pour le modèle Claire`);const modelBuffer=await response.arrayBuffer(),modelHash=await sha256(modelBuffer);results.model={bytes:modelBuffer.byteLength,sha256:modelHash};if(modelHash!==EXPECTED_MODEL_HASH)throw new Error(`Empreinte GLB inattendue : ${modelHash}`);addStep('Fichier Claire intact','pass',`${modelBuffer.byteLength.toLocaleString('fr-FR')} octets · SHA-256 validé`);

  activeStage='Décodage GLB';
  const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);const gltf=await loader.parseAsync(modelBuffer.slice(0),new URL('../../../assets/avatar-local/models/',import.meta.url).href),names=new Set(),morphs=new Set();let meshes=0,skinnedMeshes=0;gltf.scene.traverse(node=>{if(node.name)names.add(node.name);if(node.isMesh)meshes+=1;if(node.isSkinnedMesh)skinnedMeshes+=1;for(const name of Object.keys(node.morphTargetDictionary||{}))morphs.add(name);});const missing=REQUIRED_BONES.filter(name=>!names.has(name));results.gltf={nodes:names.size,meshes,skinnedMeshes,morphTargets:morphs.size,animations:gltf.animations.length,missingBones:missing};if(missing.length)throw new Error(`Os manquants : ${missing.join(', ')}`);if(morphs.size<67)throw new Error(`Morph targets insuffisants : ${morphs.size}`);addStep('Squelette et visage Claire','pass',`${names.size} nœuds · ${skinnedMeshes} mesh skinné · ${morphs.size} morph targets`);

  activeStage='Rendu Three.js de référence';
  const directHost=$('#directView'),directStage=makeStage(THREE,directHost);directStage.scene.add(gltf.scene);await frame();const directFit=directStage.fit(gltf.scene,'portrait'),directFrame=directStage.sample();results.directFrame={...directFrame,fit:directFit};if(!directFrame.ok||directFrame.render.triangles<1)throw new Error(`Canvas direct transparent (${directFrame.render.triangles} triangles)`);addStep('Claire cadrée en portrait','pass',`${directFrame.render.triangles.toLocaleString('fr-FR')} triangles · angle ${directFit.angleDegrees}°`);

  activeStage='TalkingHead animateur';
  const {TalkingHead}=await import(TALKING_HEAD_URL);addStep('TalkingHead 1.7 chargé','pass','Animation locale sans renderer interne');

  activeStage='Renderer PocketGuide corrigé';
  const talkingHost=$('#talkingView'),talkingCanvas=document.createElement('canvas'),talkingGl=talkingCanvas.getContext('webgl2',{alpha:true,antialias:false,powerPreference:'low-power',failIfMajorPerformanceCaveat:false});if(!talkingGl)throw new Error('Second contexte WebGL2 indisponible');const ratio=Math.min(1.35,Math.max(1,devicePixelRatio||1)),stage=new ClaireThreeStage({THREE,host:talkingHost,canvas:talkingCanvas,context:talkingGl,pixelRatio:ratio,modelFPS:20,view:'portrait'}),head=new TalkingHead(talkingHost,{lipsyncModules:[],avatarOnly:true,avatarOnlyScene:stage.scene,avatarOnlyCamera:stage.camera,modelFPS:20,avatarIdleHeadMove:.28,avatarSpeakingHeadMove:.35});let nativePose=[];await head.showAvatar({url:MODEL_URL,body:'F',avatarMood:'neutral',lipsyncLang:'fr',baseline:{headRotateX:-.04,eyeBlinkLeft:.1,eyeBlinkRight:.1}},null,loaded=>{nativePose=captureNativePose(loaded.scene);});if(!nativePose.length)throw new Error('Pose native Claire absente');await frame();if(head.isRunning)head.animate(50);restoreNativePose(nativePose);let fit=stage.fit(head.armature,'portrait'),talkingFrame=stage.sample(),upright=Number(fit.landmarks?.head?.[1])>Number(fit.landmarks?.chest?.[1])+.08;if(!upright)throw new Error('Claire est encore couchée après restauration de la pose');if(!talkingFrame.ok){fit=stage.fit(head.armature,'upper');talkingFrame={...stage.sample(),fallbackView:'upper'};}results.talkingHead={frame:talkingFrame,fit,upright,nativePoseBones:nativePose.length,avatarHeight:head.avatarHeight,morphTargets:Object.keys(head.mtAvatar||{}).length,renderer:'three-external',animator:'talkinghead-face-only'};if(!talkingFrame.ok||talkingFrame.render.triangles<1)throw new Error(`Nouveau renderer transparent (${talkingFrame.render.triangles} triangles)`);stage.start(head,{afterAnimate:()=>restoreNativePose(nativePose)});addStep('Pose native Claire préservée','pass',`${nativePose.length} os stabilisés · corps vertical`);addStep('Visage animé et visible','pass',`${talkingFrame.render.triangles.toLocaleString('fr-FR')} triangles · ${talkingFrame.opaque.toLocaleString('fr-FR')} pixels visibles`);

  activeStage='Terminé';results.completedAt=new Date().toISOString();verdict.dataset.state='pass';verdict.innerHTML='<strong>Claire est debout et cadrée en portrait</strong><span>Le visage reste grand, en léger trois-quarts, pendant que TalkingHead anime le labial.</span>';renderReport();
}catch(error){fail('Arrêt du diagnostic',error);}
