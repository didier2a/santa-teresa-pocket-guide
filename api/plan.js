import {cleanJson,guard,outputText} from './_util.js';

const ROUTEPACK_SCHEMA={
  type:'object',additionalProperties:false,
  required:['schemaVersion','id','title','subtitle','timezone','travelers','start','end','days','places','checklist','offline','meta'],
  properties:{
    schemaVersion:{type:'string',enum:['1.0']},
    id:{type:'string',pattern:'^[a-z0-9][a-z0-9-]{2,63}$'},
    title:{type:'string',minLength:1,maxLength:100},
    subtitle:{type:'string',maxLength:220},
    timezone:{type:'string',minLength:1,maxLength:80},
    travelers:{type:'integer',minimum:1,maximum:50},
    start:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},
    end:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},
    days:{type:'array',minItems:1,maxItems:10,items:{type:'object',additionalProperties:false,required:['date','label','subtitle','events'],properties:{
      date:{type:'string'},label:{type:'string'},subtitle:{type:'string'},
      events:{type:'array',minItems:1,maxItems:12,items:{type:'object',additionalProperties:false,required:['id','time','end','title','type','place','placeId','navigationMode'],properties:{
        id:{type:'string'},time:{type:'string'},end:{type:'string'},title:{type:'string'},type:{type:'string'},place:{type:'string'},placeId:{type:'string'},navigationMode:{type:'string',enum:['walking','driving','transit']}
      }}}
    }}},
    places:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,required:['id','name','lat','lng','icon','note','description','historyShort','historyLong','repere','arCue','heroImage','sourceLabel','sourceUrl'],properties:{
      id:{type:'string'},name:{type:'string'},lat:{type:'number',minimum:-90,maximum:90},lng:{type:'number',minimum:-180,maximum:180},icon:{type:'string'},note:{type:'string'},description:{type:'string'},historyShort:{type:'string'},historyLong:{type:'string'},repere:{type:'string'},arCue:{type:'string'},heroImage:{type:'string'},sourceLabel:{type:'string'},sourceUrl:{type:'string'}
    }}},
    checklist:{type:'array',maxItems:12,items:{type:'string'}},
    offline:{type:'object',additionalProperties:false,required:['map'],properties:{map:{type:'boolean'}}},
    meta:{type:'object',additionalProperties:false,required:['createdBy','generator','prompt','notice','sourcesCheckedAt'],properties:{createdBy:{type:'string'},generator:{type:'string'},prompt:{type:'string'},notice:{type:'string'},sourcesCheckedAt:{type:'string'}}}
  }
};

function systemPrompt(){return `Tu es PocketGuide AI Planner V1.4, un planificateur touristique terrain. Transforme la demande en RoutePack V1.0 exécutable. Utilise la recherche web pour vérifier les lieux et informations qui peuvent changer. Priorités: cohérence géographique, journées réalistes, horaires non chevauchants, étapes à pied regroupées, contraintes explicites de l'utilisateur, coordonnées plausibles et sources publiques. N'invente pas d'horaire d'ouverture précis si tu ne peux pas le vérifier. Chaque event.placeId doit référencer exactement un places[].id. Les événements d'une journée doivent être triés et ne pas se chevaucher. Les IDs sont en minuscules ASCII avec tirets. heroImage peut être vide si aucune image fiable n'est disponible. sourceUrl doit être une URL de source publique pertinente. Le résultat est un brouillon validable, jamais une garantie de disponibilité. Réponds uniquement selon le schéma fourni.`}

export default async function handler(req,res){
  if(!guard(req,res))return;
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const prompt=String(body.prompt||'').trim().slice(0,6000);
    if(prompt.length<8)return res.status(400).json({error:'Décrivez un peu plus votre voyage.'});
    const destination=String(body.destination||'').trim().slice(0,100);
    const timezone=String(body.timezone||'Europe/Paris').trim().slice(0,80);
    const maxPlaces=Math.max(3,Math.min(10,Number(body.maxPlaces)||6));
    const userInput=[prompt,destination?`Destination explicitement indiquée: ${destination}`:'',`Fuseau souhaité: ${timezone}`,`Nombre cible de repères: ${maxPlaces}`].filter(Boolean).join('\n');
    const model=process.env.OPENAI_PLANNER_MODEL||'gpt-5.4-mini';

    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        tools:[{type:'web_search'}],
        reasoning:{effort:'medium'},
        input:[
          {role:'system',content:[{type:'input_text',text:systemPrompt()}]},
          {role:'user',content:[{type:'input_text',text:userInput}]}
        ],
        text:{format:{type:'json_schema',name:'pocketguide_routepack_v1',strict:true,schema:ROUTEPACK_SCHEMA}}
      })
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const code=payload?.error?.code||payload?.error?.type||'';
      const message=payload?.error?.message||`OpenAI Responses ${response.status}`;
      console.error('PocketGuide OpenAI',response.status,code,message);
      return res.status(response.status).json({error:message,code});
    }
    const text=outputText(payload);
    if(!text)throw new Error('Réponse structurée vide');
    const pack=cleanJson(text);
    pack.meta={...pack.meta,createdBy:'PocketGuide Studio V1.4.3',generator:'openai-ai-planner-v1.4.3',prompt,sourcesCheckedAt:new Date().toISOString()};
    res.status(200).json({pack,model});
  }catch(error){
    console.error('PocketGuide planner',error?.message||error);
    res.status(500).json({error:error?.message||'AI Planner n’a pas pu construire le parcours.'});
  }
}
