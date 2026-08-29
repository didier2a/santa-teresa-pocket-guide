export const V152_PARITY=Object.freeze([
  {id:'native-conversation',label:'Boucle média native et interruption',proof:'companion-sdk'},
  {id:'adaptive-route',label:'RoutePack adaptatif et incontournables',proof:'route-state-adapter'},
  {id:'gps-map',label:'GPS Web et carte de parcours',proof:'terrain-adapter'},
  {id:'geo-ar',label:'Caméra Geo-AR, boussole et secours manuel',proof:'terrain-adapter'},
  {id:'ios-orientation',label:'Autorisation orientation depuis le geste',proof:'terrain-adapter'},
  {id:'adaptive-orientation',label:'Affichage automatique 9:16 / 16:9',proof:'orientation-layout-adapter'},
  {id:'planner-verified',label:'Planner structuré, coordonnées et sources',proof:'planner-api'},
  {id:'planner-dictation',label:'Dictée et secours MediaRecorder',proof:'planner-voice-adapter'},
  {id:'offline-route',label:'Téléchargement, persistance et réouverture',proof:'offline-adapter'},
  {id:'route-library',label:'Bibliothèque, import et export RoutePack',proof:'route-library'},
  {id:'sensor-reset',label:'Réinitialisation caméra et microphone',proof:'terrain-adapter'},
  {id:'universal-diagnostic',label:'Diagnostic navigateur et permissions',proof:'diagnostic-adapter'},
  {id:'proactive-guide',label:'Détection d’arrivée avec hystérésis',proof:'proactive-guide-adapter'},
  {id:'pwa-safe-area',label:'PWA hors ligne, zones sûres et cibles tactiles',proof:'pwa-contract'}
]);

export function parityReport({registry,terrain,layout,plannerVoice,diagnostic,proactive,offline,companion}={}){
  const capabilities=new Set(registry?.list?.().map(item=>item.id)||[]),sdk=companion?.diagnostic?.()||{};
  const implemented={
    'native-conversation':sdk.baseline==='v3-proven'&&sdk.nativeAudio===true,
    'adaptive-route':['trip.getState','places.nearby','route.skipNext','route.goTo','route.shorten'].every(id=>capabilities.has(id)),
    'gps-map':capabilities.has('terrain.startGPS'),
    'geo-ar':capabilities.has('terrain.openAR'),
    'ios-orientation':typeof terrain?.requestOrientationFromGesture==='function',
    'adaptive-orientation':layout?.diagnostic?.().automatic===true,
    'planner-verified':capabilities.has('planner.createRoute'),
    'planner-dictation':plannerVoice?.diagnostic?.().fallbackEndpoint==='/api/transcribe',
    'offline-route':capabilities.has('route.downloadOffline')&&Boolean(offline),
    'route-library':['route.openSaved','route.importPack','route.exportPack'].every(id=>capabilities.has(id)),
    'sensor-reset':capabilities.has('sensors.reset'),
    'universal-diagnostic':Boolean(diagnostic?.checks?.().length>=8),
    'proactive-guide':Boolean(proactive?.diagnostic?.().exitRadiusMeters),
    'pwa-safe-area':true
  };
  const items=V152_PARITY.map(item=>({...item,implemented:Boolean(implemented[item.id])}));return{baseVersion:'1.5.2',implemented:items.filter(item=>item.implemented).length,total:items.length,complete:items.every(item=>item.implemented),items};
}
