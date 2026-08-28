import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {eventBus} from '../../pg16/core/event-bus.js';

const VIEWS=['companion','journey','memories'];
const LABELS={companion:'Compagnon',journey:'Voyage',memories:'Mes voyages'};
let installed=false;

function normalizedView(value){return VIEWS.includes(value)?value:'companion';}

export function syncMainNavigation(value=pocketGuideState.select('ui.panel')){
  const navigation=document.querySelector('.main-nav');
  if(!navigation)return false;
  const active=normalizedView(value);
  navigation.dataset.active=active;
  for(const button of navigation.querySelectorAll('[data-view-target]')){
    const selected=button.dataset.viewTarget===active;
    button.classList.toggle('is-active',selected);
    button.setAttribute('aria-label',LABELS[button.dataset.viewTarget]||'Espace PocketGuide');
    if(selected)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }
  return true;
}

function moveFocus(event){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const buttons=[...event.currentTarget.querySelectorAll('[data-view-target]')];
  const current=buttons.indexOf(document.activeElement);
  let next=current;
  if(event.key==='Home')next=0;
  else if(event.key==='End')next=buttons.length-1;
  else if(event.key==='ArrowRight')next=(Math.max(current,0)+1)%buttons.length;
  else next=(current<=0?buttons.length:current)-1;
  event.preventDefault();
  buttons[next]?.focus();
  buttons[next]?.click();
}

export function installMainNavigation(){
  const navigation=document.querySelector('.main-nav');
  if(!navigation)return null;
  if(installed)return navigation;
  installed=true;
  navigation.dataset.pg233Navigation='ready';
  navigation.addEventListener('keydown',moveFocus);
  eventBus.on('ui.panel.changed',payload=>syncMainNavigation(payload?.after?.ui?.panel));
  syncMainNavigation();
  return navigation;
}
