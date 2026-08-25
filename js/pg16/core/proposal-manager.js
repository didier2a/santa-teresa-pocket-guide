import {pocketGuideState} from './pocketguide-state.js';
import {eventBus} from './event-bus.js';
import {actionRegistry} from './action-registry.js';
import {transactionManager} from './transaction-manager.js';

function clone(value){return typeof globalThis.structuredClone==='function'?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));}

export class ProposalManager {
  create({action,args={},reason='',summary='',requiresConfirmation=true,metadata={}}={}){
    if(!actionRegistry.has(action))throw new Error(`Action inconnue pour proposition: ${action}`);
    const definition=actionRegistry.describe(action);const proposal={id:`p_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,action,args:clone(args),reason:String(reason||''),summary:String(summary||''),requiresConfirmation:Boolean(requiresConfirmation),riskLevel:definition?.riskLevel||'safe',beforeState:pocketGuideState.get(),metadata:clone(metadata),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1000*60*15).toISOString(),status:'pending'};
    pocketGuideState.patch({proposals:{pending:proposal},conversation:{status:'waiting_confirmation',lastAction:action}},{source:'proposal-manager',event:'proposal.created'});return clone(proposal);
  }

  pending(){const proposal=pocketGuideState.select('proposals.pending');return proposal?clone(proposal):null;}
  valid(proposal=this.pending()){return Boolean(proposal&&proposal.status==='pending'&&Date.parse(proposal.expiresAt)>Date.now());}

  reject(reason='user_rejected'){
    const proposal=this.pending();if(!proposal)return null;
    const resolved={...proposal,status:'rejected',resolvedAt:new Date().toISOString(),resolutionReason:reason};
    pocketGuideState.patch({proposals:{pending:null,lastResolved:resolved},conversation:{status:'idle'}},{source:'proposal-manager',event:'proposal.rejected'});return resolved;
  }

  async confirm(){
    const proposal=this.pending();if(!this.valid(proposal)){if(proposal)this.reject('expired');throw new Error('Aucune proposition valide à confirmer');}
    const result=await transactionManager.run({name:proposal.action,metadata:{proposalId:proposal.id,reason:proposal.reason},execute:()=>actionRegistry.execute(proposal.action,proposal.args||{},{source:'proposal-confirmation',proposalId:proposal.id}),validate:({result})=>Boolean(result?.ok)});
    const resolved={...proposal,status:'confirmed',resolvedAt:new Date().toISOString()};
    pocketGuideState.patch({proposals:{pending:null,lastResolved:resolved},conversation:{status:'idle',lastAction:proposal.action}},{source:'proposal-manager',event:'proposal.confirmed'});return {proposal:resolved,transaction:result};
  }
}

export const proposalManager=new ProposalManager();