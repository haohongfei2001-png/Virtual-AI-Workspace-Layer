import assert from 'node:assert/strict';
import test from 'node:test';
import {createContextAssociationBridge} from '../../src/host/context-association.mjs';
import {LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
const C='11111111-1111-4111-8111-111111111111',P='g-p-'+'1'.repeat(32),origin='https://chatgpt.com';
for(const mode of ['conversation-late-id','project-late-label','project-late-ancestor-id'])test('existing selector dependency wakes '+mode,()=>{
 let at=1000,sequence=0,scans=0;const observers=new Set(),listeners=new Set(),timers=new Map(),answers=[];
 const project=mode.startsWith('project'),doc={location:{href:origin+(project?'/g/'+P+'/project':'/c/'+C)}};
 class MO{constructor(fn){this.fn=fn;}observe(_target,options){this.options=options;observers.add(this);}disconnect(){observers.delete(this);}}
 doc.defaultView={MutationObserver:MO,getComputedStyle:()=>({display:'block',visibility:'visible'})};
 const node=attrs=>({attrs,isConnected:true,ownerDocument:doc,parentElement:null,getClientRects:()=>[{}],getAttribute(k){return this.attrs[k]??null;},querySelectorAll:()=>[],get textContent(){throw Error('private-body-read');}});
 const ancestor=node({id:mode==='project-late-label'?'reading':'pending'}),root=project?node({'data-project-id':P,'aria-label':mode==='project-late-label'?'pending':'Project conversations'}):node({id:'pending','data-conversation-id':C});if(project)root.parentElement=ancestor;
 doc.documentElement=node({});
 doc.querySelectorAll=selector=>{scans++;if(selector===LEGACY_SURFACE_PROFILE.currentBody.rootSelector)return !project&&root.attrs.id==='reading'?[root]:[];if(selector===LEGACY_SURFACE_PROFILE.regions.members)return project&&ancestor.attrs.id==='reading'&&root.attrs['aria-label']==='Project conversations'?[root]:[];return [];};
 const profile={...LEGACY_SURFACE_PROFILE,urlPolicy:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}};
 const runtime={id:'fixture-ext',onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)}};
 const schedule=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:at+ms});return id;},cancel=id=>timers.delete(id);
 const bridge=createContextAssociationBridge({document:doc,runtime,origin,profile,now:()=>at,elapsedNow:()=>at,schedule,cancel});
 const makeMessage=challenge=>({type:'HOST_CONTEXT_ASSOCIATE',challenge,actualURL:doc.location.href,...(project?{projectId:P}:{conversationId:C}),expiresAt:new Date(7000).toISOString()});
 for(const f of listeners)f(makeMessage('original'),{id:runtime.id},a=>answers.push(a));assert.equal(answers.length,0);assert.equal(observers.size,1);
 const attribute=mode==='project-late-label'?'aria-label':'id',target=mode==='project-late-ancestor-id'?ancestor:root;target.attrs[attribute]=attribute==='id'?'reading':'Project conversations';
 const readsBefore=scans;
 // Attribute-filter-faithful observer double: only relevant mutations dispatch.
 for(const o of [...observers])if(o.options.attributeFilter.includes(attribute))o.fn([{type:'attributes',target,attributeName:attribute}]);
 at+=200;for(const [id,timer]of [...timers])if(timer.at<=at){timers.delete(id);timer.fn();}
 assert.equal(answers.length,1,'existing challenge must settle after its selector attribute arrives');
 assert.equal(answers[0]?.association,project?'explicit-project-id':'explicit-body-id');assert(scans>readsBefore);
 bridge.stop();assert.equal(observers.size,0);assert.equal(timers.size,0);
});
