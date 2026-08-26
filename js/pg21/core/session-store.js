import {resetSensorsForRealSession} from '../../pg2/core/session-store.js';

const KEY='pocketguide-v21-human-companion-session';
function safe(){try{return globalThis.localStorage||null}catch{return null}}
export function loadCompanionSession21(){try{const value=JSON.parse(safe()?.getItem(KEY)||'null');return value&&typeof value==='object'?value:null}catch{return null}}
export function saveCompanionSession21(value){try{safe()?.setItem(KEY,JSON.stringify({currentItineraryId:value?.currentItineraryId||null,quietMode:Boolean(value?.quietMode),voiceEnabled:value?.voiceEnabled!==false,conversationExpanded:value?.conversationExpanded!==false,updatedAt:new Date().toISOString()}));return true}catch{return false}}
export {KEY as PG21_SESSION_KEY,resetSensorsForRealSession};
