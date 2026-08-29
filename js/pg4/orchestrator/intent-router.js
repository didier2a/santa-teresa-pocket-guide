const NUMBER_WORDS=new Map([['une',1],['un',1],['deux',2],['trois',3],['quatre',4],['cinq',5],['six',6],['sept',7],['huit',8]]);

function normalized(value=''){return String(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function durationMinutes(value){
  const text=normalized(value),numeric=text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:h|heure|heures)\b/);
  if(numeric)return Math.round(Number(numeric[1].replace(',','.'))*60);
  for(const [word,count] of NUMBER_WORDS)if(new RegExp(`\\b${word}\\s+heures?\\b`).test(text))return count*60;
  const minutes=text.match(/\b(\d+)\s*(?:min|minute|minutes)\b/);return minutes?Number(minutes[1]):120;
}
function destination(value){
  const text=String(value||'');if(/santa\s+teresa/i.test(text))return'Santa Teresa di Gallura';
  const match=text.match(/(?:à|a|dans|pour)\s+([A-ZÀ-ÖØ-Ý][\p{L}' -]{2,60}?)(?:,|\s+(?:avec|pendant|en|pour|de)\b|$)/u);return match?.[1]?.trim()||'';
}

export class IntentRouter{
  constructor({defaultDestination='Santa Teresa di Gallura'}={}){this.defaultDestination=defaultDestination;}
  parse(raw,{source='text'}={}){
    const text=String(raw||'').trim(),value=normalized(text);if(!value)return null;
    if(/\b(arrete|stop|annule|interromps)\b/.test(value))return this.intent('operation.cancel',{},text,source,1);
    if(/\b(confirme|valide|accepte|oui c est bon|garde ce parcours)\b/.test(value))return this.intent('route.confirmProposal',{},text,source,.99);
    if(/\b(ouvre|affiche|montre)\b.*\bcarte\b/.test(value))return this.intent('nav.open',{view:'map'},text,source,.98);
    if(/\b(ouvre|affiche|montre)\b.*\b(parcours|itineraire)\b/.test(value))return this.intent('nav.open',{view:'route'},text,source,.96);
    if(/\b(ouvre|affiche|montre)\b.*\b(creer|creation|planner)\b/.test(value))return this.intent('nav.open',{view:'create'},text,source,.96);
    if(/\b(ouvre|affiche|montre)\b.*\b(guide|compagnon)\b/.test(value))return this.intent('nav.open',{view:'guide'},text,source,.96);
    if(/\b(active|demarre|lance|ouvre)\b.*\b(gps|localisation)\b/.test(value))return this.intent('terrain.startGPS',{},text,source,.98);
    if(/\b(ouvre|active|lance|ferme|desactive)\b.*\b(ar|realite augmentee)\b/.test(value))return this.intent('terrain.openAR',{active:!/(ferme|desactive)/.test(value)},text,source,.98);
    if(/\b(saute|ignore|passe)\b.*\b(prochaine|etape)\b/.test(value))return this.intent('route.skipNext',{},text,source,.98);
    if(/\b(raccourcis|raccourcir|moins de temps)\b/.test(value))return this.intent('route.shorten',{removeCount:1},text,source,.98);
    if(/\b(reinitialise|reset)\b.*\b(parcours|progression)\b/.test(value))return this.intent('route.resetProgress',{},text,source,.98);
    if(/\b(telecharge|enregistre|prepare)\b.*\b(hors ligne|offline)\b/.test(value))return this.intent('route.downloadOffline',{},text,source,.98);
    if(/\b(reinitialise|reset)\b.*\b(capteurs|camera|micro)\b/.test(value))return this.intent('sensors.reset',{},text,source,.98);
    if(/\b(active|desactive)\b.*\b(guide proactif|alertes d arrivee)\b/.test(value))return this.intent('guide.toggleProactive',{enabled:!/desactive/.test(value)},text,source,.97);
    if(/\b(ou suis je|lieux? proches?|autour de moi)\b/.test(value))return this.intent('places.nearby',{limit:4},text,source,.9);
    if(/\b(prochaine etape|reste du parcours|etat du parcours)\b/.test(value))return this.intent('trip.getState',{},text,source,.9);
    if(/\b(raconte|explique|decris)\b/.test(value)&&(source!=='liveavatar-voice'||/\b(ce lieu|cet endroit|ici|etape|lieu actuel)\b/.test(value)))return this.intent('guide.explainCurrent',{},text,source,.9);
    if(/\b(cree|cree-moi|construis|prepare|propose)\b.*\b(itineraire|parcours|promenade|balade)\b/.test(value)){
      const target=destination(text)||this.defaultDestination;
      return this.intent('planner.createRoute',{
        request:text,
        destination:target,
        durationMinutes:durationMinutes(text),
        maxPlaces:5,
        wants:{map:true,photos:true,text:true},
        transport:/\b(voiture|auto)\b/.test(value)?'driving':'walking'
      },text,source,.99);
    }
    // Une phrase conversationnelle non reconnue reste la propriété du moteur
    // LiveAvatar/OpenAI éprouvé. La transformer en capacité locale interrompait
    // la réponse native et cassait le deuxième tour sur Galaxy S22.
    if(source==='liveavatar-voice')return null;
    return this.intent('guide.localFallback',{text},text,source,.45);
  }
  intent(capabilityId,input,raw,source,confidence){return{id:`intent-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,capabilityId,input,raw,source,confidence,at:new Date().toISOString()};}
}

export {durationMinutes,normalized};
