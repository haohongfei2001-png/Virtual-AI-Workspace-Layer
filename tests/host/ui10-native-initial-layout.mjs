import assert from 'node:assert/strict';
export function observeUi10InitialLayout(currentSelector){
 const root=[...document.querySelectorAll('[data-vaiwl-owned]')].map(n=>n.shadowRoot).find(s=>s?.querySelector('.workspace'));
 if(!root)return null;const w=root.querySelector('.workspace'),b=w.getBoundingClientRect(),font=n=>{if(!n)return null;const s=getComputedStyle(n);return {fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight};};
 return {boardBounds:{x:b.x,y:b.y,width:b.width,height:b.height},frameViewport:{width:innerWidth,height:innerHeight},fonts:{heading:font(root.querySelector('.card h2')),row:font(root.querySelector('.card .row'))},currentRows:root.querySelectorAll(currentSelector).length,currentIds:[...root.querySelectorAll(currentSelector)].map(n=>n.getAttribute('data-ref-id')),oldRows:root.querySelectorAll('.old-list .row').length,devicePixelRatio};
}
export function ui10InitialLayoutReady(sample,target){
 const o=sample?.outer,g=sample?.geometry,b=g?.boardBounds;if(!o||!b)return false;
 return o.connected&&o.visible&&o.viewport.width===target.width&&o.viewport.height===target.height&&o.rect.width>0&&o.rect.height>0&&o.rect.x>=-1&&o.rect.y>=-1&&o.rect.x+o.rect.width<=target.width+1&&o.rect.y+o.rect.height<=target.height+1&&g.frameViewport.width===o.clientWidth&&g.frameViewport.height===o.clientHeight&&b.width>0&&b.height>0&&b.x>=-1&&b.y>=-1&&b.x+b.width<=g.frameViewport.width+1&&b.y+b.height<=g.frameViewport.height+1;
}
export async function sampleUi10InitialLayout(frame,selector){
 const element=await frame.frameElement();try{const outer=await element.evaluate(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {connected:n.isConnected,visible:s.display!=='none'&&s.visibility==='visible',viewport:{width:innerWidth,height:innerHeight},rect:{x:r.x,y:r.y,width:r.width,height:r.height},clientWidth:n.clientWidth,clientHeight:n.clientHeight};});return {outer,geometry:await frame.evaluate(observeUi10InitialLayout,selector)};}finally{await element.dispose();}
}
export async function waitUi10InitialLayout({sample,paint,target,now=()=>performance.now()}){
 const deadline=now()+6000;let previous,last,timer,expired=false;
 const failure=()=>Object.assign(Error('ui10-initial-layout-deadline'),{ui10InitialLayoutDiagnostics:{target,last}});
 const run=async()=>{do{await paint();if(expired)throw failure();last=await sample();if(expired||now()>deadline)break;if(ui10InitialLayoutReady(last,target)&&JSON.stringify(last)===JSON.stringify(previous))return last;previous=ui10InitialLayoutReady(last,target)?last:null;}while(now()<deadline);throw failure();};
 try{return await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(failure());},6000);})]);}finally{expired=true;clearTimeout(timer);}

}
export function assertUi10InitialCapturePair(before,after,target){
 try{assert(ui10InitialLayoutReady(before,target)&&ui10InitialLayoutReady(after,target),'initial capture requires target layout');assert.deepEqual(after,before,'initial layout changed during screenshot');}catch(error){error.ui10InitialLayoutDiagnostics={target,before,after};throw error;}
}
