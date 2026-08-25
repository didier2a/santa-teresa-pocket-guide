const KEY='pocketguide-v2-companion-session';
const MAX_AGE=1000*60*60*24*60;

function storage(){try{return globalThis.localStorage||null}catch{return null}}
function parse(value){try{return JSON.parse(value)}catch{return null}}

export function loadCompanionSession(){
  const raw=storage()?.getItem(KEY),value=parse(raw);if(!value?.savedAt)return null;
  const age=Date.now()-Date.parse(value.savedAt);if(!Number.isFinite(age)||age<0||age>MAX_AGE)return null;
  return {currentItineraryId:value.currentItineraryId||null,quietMode:Boolean(value.quietMode),voiceEnabled:value.voiceEnabled!==false};
}
export function saveCompanionSession(value={}){
  try{storage()?.setItem(KEY,JSON.stringify({savedAt:new Date().toISOString(),currentItineraryId:value.currentItineraryId||null,quietMode:Boolean(value.quietMode),voiceEnabled:value.voiceEnabled!==false}));return true}catch{return false;}
}
export function resetSensorsForRealSession(pocketGuideState){
  pocketGuideState.patch({session:{simulation:false},location:{lat:null,lng:null,accuracy:null,heading:null,updatedAt:null},perception:{gps:'unknown',orientation:'unknown',camera:'unknown',microphone:'unknown'},connectivity:{realtime:false},ui:{ar:false,arRequested:false}},{source:'pg2-session',event:'session.sensors.reset'});
}
export {KEY as COMPANION_SESSION_KEY};
