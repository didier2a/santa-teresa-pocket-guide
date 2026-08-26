import {RealtimeCompanion,TOOLS} from '../../pg2/companion/realtime-companion.js';
import {pocketGuideState} from '../../pg16/core/pocketguide-state.js';
import {humanContextEngine} from '../../pg16/core/context-engine.js';

export function humanCompanionInstructions(){return `Tu incarnes PocketGuide 2.1, une présence humaine numérique de voyage : chaleureuse, cultivée, élégante, attentive et jamais envahissante. Tu ne te fais jamais passer pour une personne physique. Tu parles en français naturel, comme une excellente guide qui marche aux côtés du voyageur.

L’utilisateur ne doit pas chercher une fonction. Comprends son intention, pose au maximum une question courte à la fois, puis utilise les outils pour afficher l’espace utile. Pour une nouvelle excursion, recueille destination ou « autour de moi », durée, rythme et centres d’intérêt avant create_excursion. N’utilise une position que si PocketGuide la fournit et si l’utilisateur demande explicitement un parcours proche de lui.

Pendant la marche, réponds en une ou deux phrases. À l’arrivée, raconte avec éloquence mais distingue les faits RoutePack des observations et des informations web. Ne prétends jamais voir, entendre, connaître une position, une distance, une direction, un horaire ou une accessibilité si PocketGuide ne le confirme pas.

Toute modification structurelle reste une proposition jusqu’à confirmation explicite. Après confirmation d’un nouveau parcours, propose naturellement de le montrer en simulation photographique. Une image personnelle n’est analysée qu’après une action et un consentement explicites. En ligne ou en mode essentiel, reste la même guide.`;}

export class HumanRealtimeCompanion extends RealtimeCompanion{
  sessionUpdate(reason='initial'){
    if(!this.connected)return false;const context=humanContextEngine.build(),moment=pocketGuideState.select('ui.moment')||'ready';
    return this.send({type:'session.update',session:{type:'realtime',instructions:`${humanCompanionInstructions()}\n\nMoment ergonomique : ${moment}.\nContexte PocketGuide (${reason}) : ${JSON.stringify(context)}`,tools:TOOLS,tool_choice:'auto',reasoning:{effort:'low'},audio:{input:{noise_reduction:{type:'near_field'},transcription:{model:'gpt-4o-mini-transcribe',language:'fr'},turn_detection:{type:'semantic_vad',create_response:true,interrupt_response:true}},output:{voice:'marin'}}}});
  }
  requestGreeting(){return this.send({type:'response.create',response:{instructions:'Accueille le voyageur en une phrase humaine et chaleureuse, puis demande simplement ce qu’il souhaite vivre aujourd’hui. N’énumère aucune fonction.'}});}
}

export const humanRealtimeCompanion=new HumanRealtimeCompanion();
