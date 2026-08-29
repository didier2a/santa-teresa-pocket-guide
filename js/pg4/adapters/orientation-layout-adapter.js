export class OrientationLayoutAdapter{
  constructor({windowImpl=globalThis.window,documentImpl=globalThis.document,state=null,bus=null}={}){this.window=windowImpl;this.document=documentImpl;this.state=state;this.bus=bus;this.root=null;this.mediaQuery=null;this.handler=()=>this.update();this.current='portrait';}
  install(root){
    this.root=root;this.mediaQuery=this.window?.matchMedia?.('(orientation: landscape)')||null;this.mediaQuery?.addEventListener?.('change',this.handler);this.window?.screen?.orientation?.addEventListener?.('change',this.handler);this.window?.addEventListener?.('resize',this.handler,{passive:true});this.update();return this;
  }
  detect(){const screenType=String(this.window?.screen?.orientation?.type||'');if(screenType.startsWith('landscape'))return'landscape';if(screenType.startsWith('portrait'))return'portrait';if(this.mediaQuery)return this.mediaQuery.matches?'landscape':'portrait';return Number(this.window?.innerWidth)>Number(this.window?.innerHeight)?'landscape':'portrait';}
  update(){
    const orientation=this.detect(),aspect=orientation==='landscape'?'16:9':'9:16';this.current=orientation;
    if(this.root){this.root.dataset.orientation=orientation;this.root.dataset.aspect=aspect;}
    this.document?.documentElement?.style?.setProperty?.('--pg4-media-aspect',orientation==='landscape'?'16 / 9':'9 / 16');
    this.state?.patch?.({display:{orientation,aspect,width:this.window?.innerWidth||0,height:this.window?.innerHeight||0}},{source:'layout-orientation'});this.bus?.emit?.('pg4.layout.orientation',{orientation,aspect});return{orientation,aspect};
  }
  diagnostic(){return{orientation:this.current,aspect:this.current==='landscape'?'16:9':'9:16',automatic:true,sessionPreserved:true};}
  destroy(){this.mediaQuery?.removeEventListener?.('change',this.handler);this.window?.screen?.orientation?.removeEventListener?.('change',this.handler);this.window?.removeEventListener?.('resize',this.handler);}
}
