const CREATION=/\b(cr[eé]e|cr[eé]er|pr[eé]pare|pr[eé]parer|organise|nouvelle|nouveau)\b.*\b(balade|excursion|parcours|itin[eé]raire|routepack|voyage)\b|\b(balade|excursion|parcours|itin[eé]raire)\b.*\b(ici|autour de moi|à|a|au|aux|en)\b/i;
const AROUND=/\b(ici|autour de moi|aux alentours|près de moi|proche de moi)\b/i;
const PACE={tranquille:/\b(tranquille|doucement|paisible|sans se presser|facile)\b/i,balanced:/\b(normal|équilibré|modéré|classique)\b/i,dynamic:/\b(dynamique|soutenu|sportif|beaucoup voir|maximum)\b/i};

function duration(text=''){let m=String(text).match(/(\d{1,3})\s*(?:min|minutes?)/i);if(m)return Math.max(15,Math.min(480,Number(m[1])));m=String(text).match(/(\d+(?:[.,]\d+)?)\s*(?:h|heures?)/i);if(m)return Math.max(15,Math.min(480,Math.round(Number(m[1].replace(',','.'))*60)));if(/\bune heure\b/i.test(text))return 60;if(/\bdeux heures\b/i.test(text))return 120;return null;}
function destination(text=''){const value=String(text).trim();if(AROUND.test(value))return'autour de moi';const match=value.match(/(?:^|\s)(?:à|a|au|aux|en)\s+([A-ZÀ-ÖØ-Ý][\p{L}'’ -]{1,70}?)(?=\s+(?:pour|pendant|avec|dans|de|et|sur)\b|[,.;!?]|$)/u);return match?.[1]?.trim()||'';}
function pace(text=''){for(const[id,pattern]of Object.entries(PACE))if(pattern.test(text))return id;return'';}
function interests(text=''){const found=[];for(const[label,pattern]of [['histoire',/\b(histoire|historique|patrimoine|monument|architecture)\b/i],['points de vue',/\b(point de vue|panorama|paysage|photo)\b/i],['nature',/\b(nature|plage|mer|forêt|sentier)\b/i],['gastronomie',/\b(gastronomie|restaurant|cuisine|marché|spécialité)\b/i],['art et culture',/\b(art|culture|musée|galerie)\b/i]])if(pattern.test(text))found.push(label);return found.join(', ');}
function paceLabel(value){return({tranquille:'tranquille',balanced:'équilibré',dynamic:'dynamique'})[value]||value;}

export class JourneyConcierge{
  constructor(){this.reset();}
  reset(){this.active=false;this.data={destination:'',around:false,durationMinutes:null,pace:'',interests:''};this.awaiting=null;return this;}
  isCreationRequest(text){return CREATION.test(String(text||''));}
  merge(text,location){
    const value=String(text||'').trim(),directDestination=this.awaiting==='destination'&&!AROUND.test(value)?value.replace(/[.!?]+$/,'').trim():destination(value);
    if(directDestination){this.data.destination=directDestination;this.data.around=directDestination==='autour de moi';}
    const minutes=duration(value);if(minutes)this.data.durationMinutes=minutes;
    const requestedPace=pace(value);if(requestedPace)this.data.pace=requestedPace;
    const wanted=interests(value);if(wanted)this.data.interests=wanted;
    if(this.awaiting==='duration'&&!minutes){const numeric=Number(value.replace(/\D/g,''));if(numeric)this.data.durationMinutes=numeric<=8?numeric*60:numeric;}
    if(this.awaiting==='pace'&&!requestedPace){if(/peu importe|comme tu veux|recommande/i.test(value))this.data.pace='balanced';}
    if(this.awaiting==='interests'&&!wanted&&value.length>2)this.data.interests=/peu importe|surprends|recommande/i.test(value)?'découverte locale':value.slice(0,180);
    const measured=Number.isFinite(location?.lat)&&Number.isFinite(location?.lng)&&!location?.simulated;
    return {measured};
  }
  consume(text,{location={}}={}){
    const value=String(text||'').trim();if(!value)return{handled:false};if(!this.active&&!this.isCreationRequest(value))return{handled:false};
    this.active=true;const {measured}=this.merge(value,location);
    if(!this.data.destination){this.awaiting='destination';return{handled:true,reply:'Où souhaitez-vous que je vous accompagne ? Vous pouvez nommer une ville ou simplement dire « autour de moi ».',ready:false};}
    if(this.data.around&&!measured){this.awaiting='location';return{handled:true,reply:'Pour créer un parcours autour de vous sans inventer votre position, activez d’abord votre GPS. Je reprendrai dès que je vous aurai situé.',ready:false,needsLocation:true};}
    if(!this.data.durationMinutes){this.awaiting='duration';return{handled:true,reply:'Combien de temps souhaitez-vous consacrer à cette excursion ?',ready:false};}
    if(!this.data.pace){this.awaiting='pace';return{handled:true,reply:'Préférez-vous un rythme tranquille, équilibré ou dynamique ?',ready:false};}
    if(!this.data.interests){this.awaiting='interests';return{handled:true,reply:'Qu’aimeriez-vous surtout découvrir : histoire, panoramas, nature, gastronomie, art… ou voulez-vous que je vous surprenne ?',ready:false};}
    this.awaiting=null;const data={...this.data},prompt=`Crée une excursion ${data.destination==='autour de moi'?'autour de ma position mesurée':`à ${data.destination}`} d’environ ${data.durationMinutes} minutes, à un rythme ${paceLabel(data.pace)}, centrée sur ${data.interests}.`;this.reset();return{handled:true,ready:true,reply:'Parfait. Je vérifie maintenant les lieux et je prépare une proposition claire avant de modifier votre voyage.',request:{prompt,destination:data.around?'':data.destination,maxPlaces:data.durationMinutes<=90?4:data.durationMinutes<=180?6:8},data};
  }
}

export const journeyConcierge=new JourneyConcierge();
export {duration,destination,pace,interests};
