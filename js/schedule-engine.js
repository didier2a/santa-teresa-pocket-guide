export function toMinutes(time){
  const [h,m]=String(time).split(':').map(Number);
  return h*60+m;
}

export function fromMinutes(value){
  value=((value%1440)+1440)%1440;
  return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
}

export function durationMinutes(event){
  let value=toMinutes(event.end)-toMinutes(event.time);
  if(value<0)value+=1440;
  return value;
}

export function isLockedEvent(event){
  return event?.locked===true || event?.type==='bus' || /\b(ferry|navette|bateau)\b/i.test(event?.title||'');
}

function cloneDay(day){
  return {...day,events:day.events.map(event=>({...event}))};
}

export function validateDay(day){
  const issues=[];
  for(let i=0;i<day.events.length;i++){
    const event=day.events[i];
    const start=toMinutes(event.time),end=toMinutes(event.end);
    if(end<=start)issues.push({type:'invalid-duration',index:i,message:`${event.title} doit se terminer après son début.`});
    if(isLockedEvent(event)){
      if(event.lockedTime && event.time!==event.lockedTime)issues.push({type:'locked-start',index:i,message:`${event.title} doit rester à ${event.lockedTime}.`});
      if(event.lockedEnd && event.end!==event.lockedEnd)issues.push({type:'locked-end',index:i,message:`${event.title} doit rester jusqu’à ${event.lockedEnd}.`});
    }
    if(i<day.events.length-1){
      const next=day.events[i+1];
      if(end>toMinutes(next.time))issues.push({type:'overlap',index:i,nextIndex:i+1,message:`${event.title} chevauche ${next.title}.`});
    }
  }
  return {ok:issues.length===0,issues};
}

export function restoreLockedTimes(day){
  const copy=cloneDay(day);
  for(const event of copy.events){
    if(!isLockedEvent(event))continue;
    if(event.lockedTime)event.time=event.lockedTime;
    if(event.lockedEnd)event.end=event.lockedEnd;
  }
  return copy;
}

function flexibleBlockEndIndex(day,startIndex){
  let endIndex=startIndex;
  for(let i=startIndex+1;i<day.events.length;i++){
    if(isLockedEvent(day.events[i]))break;
    endIndex=i;
  }
  return endIndex;
}

export function availableShiftWindow(day,startIndex){
  const event=day.events[startIndex];
  if(!event || isLockedEvent(event))return {minDelta:0,maxDelta:0,nextLocked:null,previous:null,blockEndIndex:startIndex};
  const blockEndIndex=flexibleBlockEndIndex(day,startIndex);
  const previous=day.events[startIndex-1]||null;
  const nextLocked=day.events[blockEndIndex+1]||null;
  const minDelta=previous ? toMinutes(previous.end)-toMinutes(event.time) : -toMinutes(event.time);
  const blockEnd=day.events[blockEndIndex];
  const maxDelta=nextLocked ? toMinutes(nextLocked.time)-toMinutes(blockEnd.end) : 1440-toMinutes(blockEnd.end);
  return {minDelta,maxDelta,nextLocked,previous,blockEndIndex};
}

export function shiftFlexibleBlock(day,startIndex,requestedDelta){
  if(!day.events[startIndex])return {ok:false,day,message:'Étape introuvable.',appliedDelta:0};
  if(isLockedEvent(day.events[startIndex]))return {ok:false,day,message:'Cette étape est verrouillée.',appliedDelta:0};
  const window=availableShiftWindow(day,startIndex);
  const appliedDelta=Math.max(window.minDelta,Math.min(window.maxDelta,requestedDelta));
  if(appliedDelta===0 && requestedDelta!==0){
    const reason=requestedDelta>0 && window.nextLocked ? `Aucune marge avant ${window.nextLocked.time} · ${window.nextLocked.title}.` : 'Aucune marge disponible.';
    return {ok:false,day,message:reason,appliedDelta:0,window};
  }
  const copy=cloneDay(day);
  for(let i=startIndex;i<=window.blockEndIndex;i++){
    copy.events[i].time=fromMinutes(toMinutes(copy.events[i].time)+appliedDelta);
    copy.events[i].end=fromMinutes(toMinutes(copy.events[i].end)+appliedDelta);
  }
  const validation=validateDay(copy);
  if(!validation.ok)return {ok:false,day,message:validation.issues[0].message,appliedDelta:0,window,validation};
  const capped=appliedDelta!==requestedDelta;
  return {ok:true,day:copy,appliedDelta,capped,window,message:capped?`Décalage limité à ${appliedDelta>0?'+':''}${appliedDelta} min pour respecter la prochaine contrainte fixe.`:`Programme décalé de ${appliedDelta>0?'+':''}${appliedDelta} min.`};
}

export function editEventSafely(day,index,newStart,newEnd,{shiftFollowing=true}={}){
  const current=day.events[index];
  if(!current)return {ok:false,day,message:'Étape introuvable.'};
  if(isLockedEvent(current))return {ok:false,day,message:`${current.title} est une contrainte fixe et ne peut pas être déplacée.`};
  if(toMinutes(newEnd)<=toMinutes(newStart))return {ok:false,day,message:'L’heure de fin doit être après l’heure de début.'};

  const copy=cloneDay(day);
  const originalStart=toMinutes(current.time);
  const delta=toMinutes(newStart)-originalStart;
  copy.events[index].time=newStart;
  copy.events[index].end=newEnd;

  if(shiftFollowing && delta!==0){
    for(let i=index+1;i<copy.events.length;i++){
      if(isLockedEvent(copy.events[i]))break;
      copy.events[i].time=fromMinutes(toMinutes(copy.events[i].time)+delta);
      copy.events[i].end=fromMinutes(toMinutes(copy.events[i].end)+delta);
    }
  }

  const validation=validateDay(copy);
  if(!validation.ok){
    const issue=validation.issues[0];
    return {ok:false,day,message:`Modification refusée : ${issue.message}`,validation};
  }
  return {ok:true,day:copy,message:'Horaire mis à jour sans déplacer les contraintes fixes.'};
}

export function recoverMinutes(day,startIndex,requested=30,minDuration=15){
  const copy=cloneDay(day);
  let index=startIndex;
  while(index<copy.events.length && isLockedEvent(copy.events[index]))index++;
  if(index>=copy.events.length)return {ok:false,day,message:'Aucune étape flexible disponible.'};
  const event=copy.events[index];
  const recoverable=Math.max(0,durationMinutes(event)-minDuration);
  const actual=Math.min(requested,recoverable);
  if(actual<=0)return {ok:false,day,message:`${event.title} est déjà trop courte pour être réduite.`};
  event.end=fromMinutes(toMinutes(event.end)-actual);
  for(let i=index+1;i<copy.events.length;i++){
    if(isLockedEvent(copy.events[i]))break;
    copy.events[i].time=fromMinutes(toMinutes(copy.events[i].time)-actual);
    copy.events[i].end=fromMinutes(toMinutes(copy.events[i].end)-actual);
  }
  const validation=validateDay(copy);
  if(!validation.ok)return {ok:false,day,message:validation.issues[0].message};
  return {ok:true,day:copy,recovered:actual,message:`${actual} min récupérées sur ${event.title}.`};
}
