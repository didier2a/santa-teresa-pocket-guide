import {pocketGuideState} from './pocketguide-state.js';
import {eventBus} from './event-bus.js';

function clone(value){return typeof globalThis.structuredClone==='function'?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));}

export class TransactionManager {
  constructor(){this.history=[];this.limit=20;}

  async run({name='transaction',execute,validate=()=>true,metadata={}}={}){
    if(typeof execute!=='function')throw new TypeError('Transaction execute manquant');
    const before=pocketGuideState.get();eventBus.emit('transaction.started',{name,metadata});
    try{
      const result=await execute();const valid=await validate({before,after:pocketGuideState.get(),result});
      if(!valid)throw new Error(`Validation transaction échouée: ${name}`);
      const after=pocketGuideState.get();this.history.push({id:`tx_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name,before:clone(before),after:clone(after),metadata:clone(metadata),committedAt:new Date().toISOString()});
      while(this.history.length>this.limit)this.history.shift();eventBus.emit('transaction.committed',{name,result});return {ok:true,result,after};
    }catch(error){pocketGuideState.replace(before,{source:'transaction-rollback'});eventBus.emit('transaction.rolled_back',{name,error:String(error?.message||error)});throw error;}
  }

  canUndo(){return this.history.length>0;}
  undo(){const tx=this.history.pop();if(!tx)return null;const current=pocketGuideState.get();pocketGuideState.replace(tx.before,{source:'transaction-undo'});eventBus.emit('transaction.undone',{id:tx.id,name:tx.name,beforeCurrent:current});return tx;}
  last(){const tx=this.history.at(-1);return tx?clone(tx):null;}
  clear(){this.history.length=0;eventBus.emit('transaction.history.cleared',{});}
}

export const transactionManager=new TransactionManager();