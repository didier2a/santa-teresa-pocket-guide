import {installRouteMemory} from '../memory/route-memory.js';

installRouteMemory();

import('./app-rc-bootstrap.js').catch(error=>{
  console.error('PocketGuide 1.6 RC bootstrap failed',error);
  const target=document.querySelector('#guideAnswer');
  if(target)target.textContent=`Erreur de démarrage : ${error?.message||error}`;
});
