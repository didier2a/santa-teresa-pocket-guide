const DB_NAME='pocketguide-v18-local';
const DB_VERSION=1;
const ITINERARY_STORE='itineraries';
const MEDIA_STORE='media';

function clone(value){
  if(value==null)return value;
  return typeof globalThis.structuredClone==='function'?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));
}

function requestResult(request){
  return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('IndexedDB indisponible.'));});
}

function transactionDone(transaction){
  return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error||new Error('Échec de la transaction locale.'));transaction.onabort=()=>reject(transaction.error||new Error('Transaction locale annulée.'));});
}

export class MemoryItineraryDriver{
  constructor(){this.itineraries=new Map();this.media=new Map();}
  async put(store,value){const target=store===ITINERARY_STORE?this.itineraries:this.media;target.set(value.id,clone(value));return clone(value);}
  async get(store,id){const target=store===ITINERARY_STORE?this.itineraries:this.media;return clone(target.get(id)||null);}
  async getAll(store){const target=store===ITINERARY_STORE?this.itineraries:this.media;return [...target.values()].map(clone);}
  async delete(store,id){const target=store===ITINERARY_STORE?this.itineraries:this.media;return target.delete(id);}
  async deleteItinerary(id){this.itineraries.delete(id);for(const [mediaId,item] of this.media)if(item.itineraryId===id)this.media.delete(mediaId);}
}

export class IndexedDbItineraryDriver{
  constructor({indexedDB=globalThis.indexedDB,dbName=DB_NAME}={}){this.indexedDB=indexedDB;this.dbName=dbName;this.dbPromise=null;}
  open(){
    if(this.dbPromise)return this.dbPromise;
    if(!this.indexedDB)throw new Error('Le stockage IndexedDB n’est pas disponible.');
    this.dbPromise=new Promise((resolve,reject)=>{
      const request=this.indexedDB.open(this.dbName,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(ITINERARY_STORE)){
          const store=db.createObjectStore(ITINERARY_STORE,{keyPath:'id'});
          store.createIndex('updatedAt','updatedAt');store.createIndex('status','status');
        }
        if(!db.objectStoreNames.contains(MEDIA_STORE)){
          const store=db.createObjectStore(MEDIA_STORE,{keyPath:'id'});
          store.createIndex('itineraryId','itineraryId');store.createIndex('eventId','eventId');store.createIndex('capturedAt','capturedAt');
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>{this.dbPromise=null;reject(request.error||new Error('Impossible d’ouvrir le stockage local.'));};
    });
    return this.dbPromise;
  }
  async put(store,value){const db=await this.open(),tx=db.transaction(store,'readwrite');tx.objectStore(store).put(clone(value));await transactionDone(tx);return clone(value);}
  async get(store,id){const db=await this.open(),tx=db.transaction(store,'readonly'),value=await requestResult(tx.objectStore(store).get(id));return clone(value||null);}
  async getAll(store){const db=await this.open(),tx=db.transaction(store,'readonly'),values=await requestResult(tx.objectStore(store).getAll());return values.map(clone);}
  async delete(store,id){const db=await this.open(),tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);await transactionDone(tx);return true;}
  async deleteItinerary(id){
    const db=await this.open(),tx=db.transaction([ITINERARY_STORE,MEDIA_STORE],'readwrite');
    tx.objectStore(ITINERARY_STORE).delete(id);
    const media=tx.objectStore(MEDIA_STORE),index=media.index('itineraryId'),range=IDBKeyRange.only(id),request=index.openCursor(range);
    request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};
    await transactionDone(tx);
  }
}

export class ItineraryStore{
  constructor({driver}={}){this.driver=driver||new IndexedDbItineraryDriver();}
  async saveItinerary(itinerary){if(!itinerary?.id)throw new Error('Identifiant d’itinéraire manquant.');return this.driver.put(ITINERARY_STORE,itinerary);}
  async getItinerary(id){return this.driver.get(ITINERARY_STORE,id);}
  async listItineraries({includeArchived=false}={}){
    const items=await this.driver.getAll(ITINERARY_STORE);
    return items.filter(item=>includeArchived||item.status!=='archived').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  }
  async deleteItinerary(id){await this.driver.deleteItinerary(id);return true;}
  async saveMedia(media){if(!media?.id||!media?.itineraryId)throw new Error('Média local incomplet.');return this.driver.put(MEDIA_STORE,media);}
  async getMedia(id){return this.driver.get(MEDIA_STORE,id);}
  async listMedia(itineraryId){const all=await this.driver.getAll(MEDIA_STORE);return all.filter(item=>item.itineraryId===itineraryId).sort((a,b)=>String(a.capturedAt||'').localeCompare(String(b.capturedAt||'')));}
  async deleteMedia(id){return this.driver.delete(MEDIA_STORE,id);}
  async storageEstimate(){
    try{const estimate=await globalThis.navigator?.storage?.estimate?.();return {usage:Number(estimate?.usage)||0,quota:Number(estimate?.quota)||0};}
    catch{return {usage:0,quota:0};}
  }
}

export const itineraryStore=new ItineraryStore();
export {DB_NAME,DB_VERSION,ITINERARY_STORE,MEDIA_STORE};
