export const AVATAR_MODES=Object.freeze(['auto','portrait','local','live']);

export function normalizeAvatarMode(value,fallback='auto'){
  const mode=String(value||'').toLowerCase();
  return AVATAR_MODES.includes(mode)?mode:fallback;
}

export function avatarNetworkPolicy({requested='auto',online=true,saveData=false,effectiveType='',connectionType='',localReady=false,liveReady=false,liveOptIn=false,allowLiveOnCellular=false}={}){
  const mode=normalizeAvatarMode(requested);
  if(mode==='portrait')return{mode:'portrait',reason:'manual-portrait'};
  if(mode==='local')return localReady?{mode:'local',reason:'manual-local'}:{mode:'portrait',reason:'local-not-ready'};
  if(mode==='live'){
    if(!online)return localReady?{mode:'local',reason:'offline'}:{mode:'portrait',reason:'offline'};
    if(!liveReady)return localReady?{mode:'local',reason:'live-not-ready'}:{mode:'portrait',reason:'live-not-ready'};
    return{mode:'live',reason:'manual-live'};
  }
  if(localReady)return{mode:'local',reason:'auto-local'};
  const slow=/^(slow-2g|2g|3g)$/i.test(String(effectiveType||''));
  const cellular=/cellular/i.test(String(connectionType||''))||/^[45]g$/i.test(String(connectionType||''));
  if(online&&liveReady&&liveOptIn&&!saveData&&!slow&&(!cellular||allowLiveOnCellular))return{mode:'live',reason:'auto-live-approved'};
  return{mode:'portrait',reason:!online?'offline':saveData?'save-data':slow?'slow-network':cellular?'cellular-local':'local-pending'};
}

export function browserConnectionSnapshot(scope=globalThis){
  const connection=scope.navigator?.connection||scope.navigator?.mozConnection||scope.navigator?.webkitConnection;
  return{online:scope.navigator?.onLine!==false,saveData:Boolean(connection?.saveData),effectiveType:String(connection?.effectiveType||''),connectionType:String(connection?.type||'')};
}
