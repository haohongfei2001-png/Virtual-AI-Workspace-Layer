import {observeCurrentFrame} from './observe-current-frame.mjs';
/** Wait for an actual ready VIEW receipt, not for a desired pagination value. */
export async function currentJ1View(getFrame,options){let view=null;const frame=await observeCurrentFrame(getFrame,async current=>{view=await current.evaluate(()=>globalThis.j1ViewTrace?.filter(v=>v.kind==='view').at(-1)??null);return view!==null;},options);return {frame,view};}
