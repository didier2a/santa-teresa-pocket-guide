import {eventBus} from '../../pg16/core/event-bus.js';

export const CYBERNETIC_STATES=Object.freeze({
  IDLE:'idle',LISTENING:'listening',INTERPRETING:'interpreting',CHECKING:'checking',ACTING:'acting',VERIFYING:'verifying',
  SUCCEEDED:'succeeded',DEGRADED:'degraded',BLOCKED:'blocked',FAILED:'failed'
});

const TERMINAL=new Set([CYBERNETIC_STATES.SUCCEEDED,CYBERNETIC_STATES.DEGRADED,CYBERNETIC_STATES.BLOCKED,CYBERNETIC_STATES.FAILED]);
const ALLOWED=new Map([
  ['idle',new Set(['idle','listening','interpreting','degraded','blocked','failed'])],
  ['listening',new Set(['listening','interpreting','idle','blocked','failed'])],
  ['interpreting',new Set(['interpreting','checking','idle','blocked','failed'])],
  ['checking',new Set(['checking','acting','idle','blocked','degraded','failed'])],
  ['acting',new Set(['acting','verifying','blocked','degraded','failed','idle'])],
  ['verifying',new Set(['verifying','succeeded','degraded','blocked','failed','idle'])],
  ['succeeded',new Set(['succeeded','listening','interpreting','checking','idle'])],
  ['degraded',new Set(['degraded','listening','interpreting','checking','acting','idle','failed'])],
  ['blocked',new Set(['blocked','listening','interpreting','checking','idle','failed'])],
  ['failed',new Set(['failed','listening','interpreting','idle'])]
]);

function phaseFor(value){if(TERMINAL.has(value))return'terminal';if(value==='idle')return'ready';return'active';}
function freezeEvidence(value){return value&&typeof value==='object'?Object.freeze({...value}):null;}

export class CyberneticStateMachine{
  constructor({bus=eventBus,clock=()=>new Date().toISOString(),logger=console,maxHistory=64}={}){
    this.bus=bus;this.clock=clock;this.logger=logger;this.maxHistory=Math.max(8,Number(maxHistory)||64);this.sequence=0;this.records=[];
    this.current=Object.freeze({value:'idle',previous:null,phase:'ready',sequence:0,commandId:null,intent:null,detail:'Prêt',reason:'boot',evidence:null,source:'pg3',at:this.clock()});
  }
  get snapshot(){return this.current;}
  history(){return this.records.map(record=>({...record}));}
  canTransition(next){return ALLOWED.get(this.current.value)?.has(String(next||''))||false;}
  transition(next,{commandId,intent,detail,reason='state-change',evidence=null,source='pg3'}={}){
    const value=String(next||'').toLowerCase();
    if(!ALLOWED.has(value))throw new RangeError(`État cybernétique inconnu: ${value||'(vide)'}`);
    if(!this.canTransition(value))throw new Error(`Transition cybernétique interdite: ${this.current.value} -> ${value}`);
    const previous=this.current;
    const snapshot=Object.freeze({
      value,previous:previous.value,phase:phaseFor(value),sequence:++this.sequence,
      commandId:commandId===undefined?(value==='idle'?null:previous.commandId):commandId,
      intent:intent===undefined?(value==='idle'?null:previous.intent):intent,
      detail:String(detail||''),reason:String(reason||'state-change'),evidence:freezeEvidence(evidence),source:String(source||'pg3'),at:this.clock()
    });
    this.current=snapshot;this.records.push(snapshot);if(this.records.length>this.maxHistory)this.records.splice(0,this.records.length-this.maxHistory);
    this.logger?.info?.('[PocketGuide V3] orchestrator transition',{from:previous.value,to:value,commandId:snapshot.commandId,intent:snapshot.intent,reason:snapshot.reason});
    this.bus.emit('pg3.state.changed',snapshot);this.bus.emit(`pg3.state.${value}`,snapshot);return snapshot;
  }
  reset(reason='reset'){return this.transition('idle',{reason,detail:'Prêt'});}
}

export const cyberneticStateMachine=new CyberneticStateMachine();
