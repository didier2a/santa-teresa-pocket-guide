export const V51_PHOTO_MAP={
  piazza:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Santa_Teresa_di_Gallura%2C_piazza_Vittorio_Emanuele_I.jpg?width=960',credit:'Basilicofresco · Wikimedia Commons · CC BY-SA 4.0',page:'https://commons.wikimedia.org/wiki/File:Santa_Teresa_di_Gallura,_piazza_Vittorio_Emanuele_I.jpg',exact:true,label:'Photo du lieu'},
  rena:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Rena_Bianca_Beach%2C_Santa_Teresa_Gallura.jpg?width=960',credit:'Or kriminal · Wikimedia Commons · CC BY-SA 3.0',page:'https://commons.wikimedia.org/wiki/File:Rena_Bianca_Beach,_Santa_Teresa_Gallura.jpg',exact:true,label:'Photo du lieu'},
  torre:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Torre_di_Longonsardo%2C_Santa_Teresa_di_Gallura.jpg?width=960',credit:'Basilicofresco · Wikimedia Commons · CC BY-SA 4.0',page:'https://commons.wikimedia.org/wiki/File:Torre_di_Longonsardo,_Santa_Teresa_di_Gallura.jpg',exact:true,label:'Photo du lieu'},
  modesto:{image:'',credit:null,page:null,exact:false,label:'Aucune photographie touristique vérifiée disponible'},
  faro:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Capo_Testa.JPG?width=960',credit:'LPLT · Wikimedia Commons · CC BY-SA 3.0',page:'https://commons.wikimedia.org/wiki/File:Capo_Testa.JPG',exact:true,label:'Photo de Capo Testa / phare'},
  francese:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Santa_Teresa_Gallura_-_Capo_Testa_%2826%29.JPG?width=960',credit:'Gianni Careddu · Wikimedia Commons',page:'https://commons.wikimedia.org/wiki/File:Santa_Teresa_Gallura_-_Capo_Testa_(26).JPG',exact:false,label:'Photo du secteur de Capo Testa — Cala Francese exacte non garantie'},
  luna:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Valle_della_Luna_in_Gallura%2C_Sardegna.jpg?width=960',credit:'Rosalena.disalvo · Wikimedia Commons · CC BY-SA 4.0',page:'https://commons.wikimedia.org/wiki/File:Valle_della_Luna_in_Gallura,_Sardegna.jpg',exact:true,label:'Photo du lieu'},
  brandali:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Lu_Brandali.jpg?width=960',credit:'Photo2023 · Wikimedia Commons · CC BY 4.0',page:'https://commons.wikimedia.org/wiki/File:Lu_Brandali.jpg',exact:true,label:'Photo du lieu'},
  panorama:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Capo_di_testa.jpg?width=960',credit:'Tobias Helfrich · Wikimedia Commons',page:'https://commons.wikimedia.org/wiki/File:Capo_di_testa.jpg',exact:false,label:'Photo panoramique du secteur de Capo Testa'}
};

function audioShort(place){return `Vous approchez de ${place.name}. ${place.historyShort||place.description||place.note||''} ${place.arCue||place.repere||''}`.trim()}
function audioLong(place){return `Vous êtes à ${place.name}. ${place.description||place.note||''} ${place.historyShort||''} ${place.historyLong||place.detail||''} ${place.arCue||place.repere||''}`.trim()}
function isSantaTeresaTrip(data){
  const trip=data?.trip||{};
  const routeId=String(trip.routeId||'').trim().toLowerCase();
  if(routeId)return routeId==='santa-teresa';
  return trip.title==='Santa Teresa Pocket Guide'&&trip.start==='2026-09-17'&&trip.end==='2026-09-18';
}
function defaultNavigationMode(event){
  if(['marche','balade','plage','pause'].includes(event?.type))return'walking';
  if(['bus','transfert'].includes(event?.type))return'driving';
  return'mixed';
}

export function applyV51Config(data){
  const santaTeresa=isSantaTeresaTrip(data);
  data.trip=data.trip||{};

  if(santaTeresa){
    data.trip.version='V5.1';
    data.trip.tagline='Compagnon intelligent fiabilisé terrain';
    data.trip.constraints={
      returnBufferEnd:'2026-09-18T12:00:00+02:00',
      returnFerry:{status:'horaire de billet à confirmer',note:'La fin du circuit est verrouillée à 12:00 afin de préserver une marge avant le retour au port.'}
    };
  }

  for(const day of data.days||[]){
    for(const event of day.events||[]){
      if(santaTeresa&&(event.type==='bus'||/navette|ferry|bateau/i.test(event.title||''))){
        event.locked=true;event.lockedTime=event.time;event.lockedEnd=event.end;event.lockReason='Transport à horaire fixe';
      }
      if(!event.navigationMode)event.navigationMode=defaultNavigationMode(event);
    }
  }

  if(santaTeresa){
    const day2=(data.days||[]).find(d=>d.date==='2026-09-18');
    const terminal=day2?.events?.at(-1);
    if(terminal){terminal.locked=true;terminal.lockedTime=terminal.time;terminal.lockedEnd=terminal.end;terminal.lockReason='Fin du circuit / marge protégée avant retour au port';}
  }

  for(const place of data.places||[]){
    const photo=santaTeresa?V51_PHOTO_MAP[place.id]:null;
    if(photo){place.heroImage=photo.image;place.gallery=[photo.image];place.photoCredit=photo.credit;place.photoPage=photo.page;place.photoExact=photo.exact;place.photoLabel=photo.label;}
    if(!place.walkingUrl)place.walkingUrl=`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`;
    if(!place.waze)place.waze=`https://www.waze.com/ul?ll=${place.lat}%2C${place.lng}&navigate=yes`;
    if(!place.audioShort)place.audioShort=audioShort(place);
    if(!place.audioLong)place.audioLong=audioLong(place);
  }
  const by=Object.fromEntries((data.places||[]).map(p=>[p.id,p]));
  for(const item of data.discover||[])if(by[item.placeId]&&!item.image)item.image=by[item.placeId].heroImage;
  return data;
}

export const V51_PHOTO_URLS=Object.values(V51_PHOTO_MAP).map(p=>p.image).filter(x=>/^https:\/\//.test(x));
