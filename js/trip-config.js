const PHOTOS={
  piazza:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Santa_Teresa_di_Gallura%2C_piazza_Vittorio_Emanuele_I.jpg?width=960',credit:'Basilicofresco · Wikimedia Commons · CC BY-SA 4.0',page:'https://commons.wikimedia.org/wiki/File:Santa_Teresa_di_Gallura,_piazza_Vittorio_Emanuele_I.jpg',exact:true,label:'Photo du lieu'},
  rena:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Rena_Bianca_Beach%2C_Santa_Teresa_Gallura.jpg?width=960',credit:'Or kriminal · Wikimedia Commons · CC BY-SA 3.0',page:'https://commons.wikimedia.org/wiki/File:Rena_Bianca_Beach,_Santa_Teresa_Gallura.jpg',exact:true,label:'Photo du lieu'},
  torre:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Torre_di_Longonsardo%2C_Santa_Teresa_di_Gallura.jpg?width=960',credit:'Basilicofresco · Wikimedia Commons · CC BY-SA 4.0',page:'https://commons.wikimedia.org/wiki/File:Torre_di_Longonsardo,_Santa_Teresa_di_Gallura.jpg',exact:true,label:'Photo du lieu'},
  modesto:{image:'assets/photos/modesto.svg',credit:null,page:null,exact:false,label:'Repère cartographique — aucune photo exacte validée'},
  faro:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Capo_Testa.JPG?width=960',credit:'LPLT · Wikimedia Commons · CC BY-SA 3.0',page:'https://commons.wikimedia.org/wiki/File:Capo_Testa.JPG',exact:true,label:'Photo de Capo Testa / phare'},
  francese:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Santa_Teresa_Gallura_-_Capo_Testa_%2826%29.JPG?width=960',credit:'Gianni Careddu · Wikimedia Commons',page:'https://commons.wikimedia.org/wiki/File:Santa_Teresa_Gallura_-_Capo_Testa_(26).JPG',exact:false,label:'Photo du secteur de Capo Testa — Cala Francese exacte non garantie'},
  luna:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Valle_della_Luna_in_Gallura%2C_Sardegna.jpg?width=960',credit:'Rosalena.disalvo · Wikimedia Commons',page:'https://commons.wikimedia.org/wiki/File:Valle_della_Luna_in_Gallura,_Sardegna.jpg',exact:true,label:'Photo du lieu'},
  brandali:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Lu_Brandali.jpg?width=960',credit:'Photo2023 · Wikimedia Commons · CC BY 4.0',page:'https://commons.wikimedia.org/wiki/File:Lu_Brandali.jpg',exact:true,label:'Photo du lieu'},
  panorama:{image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Capo_di_testa.jpg?width=960',credit:'Tobias Helfrich · Wikimedia Commons',page:'https://commons.wikimedia.org/wiki/File:Capo_di_testa.jpg',exact:false,label:'Photo panoramique du secteur de Capo Testa'}
};

function audioShort(place){return `Vous approchez de ${place.name}. ${place.historyShort||place.description||place.note||''} ${place.arCue||place.repere||''}`.trim()}
function audioLong(place){return `Vous êtes à ${place.name}. ${place.description||place.note||''} ${place.historyShort||''} ${place.historyLong||place.detail||''} ${place.arCue||place.repere||''}`.trim()}

export function applyV51Config(data){
  data.trip.version='V5.1';
  data.trip.tagline='Compagnon intelligent fiabilisé terrain';
  data.trip.constraints={
    returnBufferEnd:'2026-09-18T12:00:00+02:00',
    returnFerry:{status:'horaire de billet à confirmer',note:'La fin du circuit est verrouillée à 12:00 afin de préserver une marge avant le retour au port.'}
  };
  for(const day of data.days||[]){
    for(const event of day.events||[]){
      if(event.type==='bus'||/navette|ferry|bateau/i.test(event.title||'')){
        event.locked=true;event.lockedTime=event.time;event.lockedEnd=event.end;event.lockReason='Transport à horaire fixe';
      }
      event.navigationMode=['marche','balade','plage','pause'].includes(event.type)?'walking':['bus','transfert'].includes(event.type)?'driving':'mixed';
    }
  }
  const day2=(data.days||[]).find(d=>d.date==='2026-09-18');
  const terminal=day2?.events?.at(-1);
  if(terminal){terminal.locked=true;terminal.lockedTime=terminal.time;terminal.lockedEnd=terminal.end;terminal.lockReason='Fin du circuit / marge protégée avant retour au port';}
  for(const place of data.places||[]){
    const photo=PHOTOS[place.id];
    if(photo){place.heroImage=photo.image;place.gallery=[photo.image];place.photoCredit=photo.credit;place.photoPage=photo.page;place.photoExact=photo.exact;place.photoLabel=photo.label;}
    place.walkingUrl=`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`;
    place.audioShort=audioShort(place);place.audioLong=audioLong(place);
  }
  const by=Object.fromEntries((data.places||[]).map(p=>[p.id,p]));
  for(const item of data.discover||[])if(by[item.placeId])item.image=by[item.placeId].heroImage;
  return data;
}

export const V51_PHOTO_URLS=Object.values(PHOTOS).map(p=>p.image).filter(x=>/^https:\/\//.test(x));
