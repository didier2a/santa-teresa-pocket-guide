const VALID_STATUS=new Set(['started','progress','succeeded','degraded','failed','cancelled','blocked']);
let evidenceSequence=0;

function makeId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  evidenceSequence+=1;return`pg4-evidence-${Date.now()}-${evidenceSequence}`;
}

export class EvidenceBus{
  constructor({bus,auditLog}={}){this.bus=bus;this.auditLog=auditLog;this.last=null;}
  publish(input={}){
    const status=VALID_STATUS.has(input.status)?input.status:'failed';
    const evidence=Object.freeze({
      id:input.id||makeId(),
      transactionId:input.transactionId||null,
      capabilityId:String(input.capabilityId||'unknown'),
      status,
      source:input.source||'application',
      speech:String(input.speech||''),
      data:input.data??null,
      error:input.error?String(input.error):null,
      durationMs:Number.isFinite(input.durationMs)?Math.max(0,Math.round(input.durationMs)):null,
      at:input.at||new Date().toISOString()
    });
    this.last=evidence;this.auditLog?.append(evidence);this.bus?.emit('pg4.evidence',evidence);this.bus?.emit(`pg4.evidence.${status}`,evidence);return evidence;
  }
}

