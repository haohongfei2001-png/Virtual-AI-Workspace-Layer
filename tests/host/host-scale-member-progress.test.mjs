import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {readHostScaleMemberProgress,hostScaleMemberReadingVisible,waitHostScaleMemberProgress} from './fixtures/host-scale-member-progress.mjs';
import {auditHostScaleIndex} from './fixtures/host-scale-audit.mjs';
import {measureAtAdmittedScale} from './fixtures/host-scale-measurement.mjs';
import {waitHostScaleSurfaces} from './fixtures/host-scale-surfaces.mjs';
const id=i=>'60000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),projectId='g-p-00000000000000000000000000000001',tail=id(999),extensionId='exactextension',url='http://127.0.0.1:1234/g/'+projectId+'/project',input={id:tail,projectId};
const member={id:tail,state:'PROJECT',projectId};
function pageResult(membership=member){return {revision:3,selectedRefs:[tail],selectedProjects:[],facts:{refs:{[tail]:{id:tail}},membership:membership?{[tail]:membership}:{},projects:{[projectId]:{id:projectId}}}};}
test('progress uses one exact ID page, no full inventory/version audit',async()=>{let count=0;const r=await readHostScaleMemberProgress(input,{page:async options=>{count++;assert.deepEqual(options,{ids:{projects:[],refs:[tail]},limit:1});return pageResult();}});assert.equal(count,1);assert.equal(r.status,'OBSERVED_TAIL_ONLY');assert.equal(r.revision,3);assert.equal(r.scopeSelector,null);});
for(const kind of ['missing-ref','missing-membership','unknown'])test('tail progress remains pending for '+kind,async()=>{const page=pageResult();if(kind==='missing-ref')page.facts.refs={};if(kind==='missing-membership')page.facts.membership={};if(kind==='unknown')page.facts.membership[tail]={id:tail,state:'UNKNOWN',projectId:null};assert.equal((await readHostScaleMemberProgress(input,{page:async()=>page})).status,'PENDING_MEMBER');});
for(const kind of ['NONE','wrong-project','wrong-ref','wrong-membership-id','missing-project'])test('tail progress rejects '+kind,async()=>{const page=pageResult();if(kind==='NONE')page.facts.membership[tail]={id:tail,state:'NONE',projectId:null};if(kind==='wrong-project')page.facts.membership[tail]={id:tail,state:'PROJECT',projectId:'other'};if(kind==='wrong-ref')page.facts.refs[tail]={id:id(1)};if(kind==='wrong-membership-id')page.facts.membership[tail]={id:id(1),state:'PROJECT',projectId};if(kind==='missing-project')page.facts.projects={};await assert.rejects(readHostScaleMemberProgress(input,{page:async()=>page}),/wrong-membership/);});
test('invalid IDs and unbounded selectors are rejected before reading',async()=>{for(const patch of [{id:'wrong'},{projectId:'wrong'},{scopeSelector:['a','b']},{scopeSelector:['a','b','bad/']}])await assert.rejects(readHostScaleMemberProgress({...input,...patch},{page:()=>assert.fail('read')}),/invalid-member-progress-input/);});
function waiting({results=['PENDING_MEMBER','OBSERVED_TAIL_ONLY'],read=null}={}){
 let time=0,closed=false,visible=true,frames,reads=0,checks=0,selectorInputs=[];
 const frame={url:()=>`chrome-extension://${extensionId}/workspace.html`,isDetached:()=>false,evaluate:async(fn,input)=>{if(fn!==readHostScaleMemberProgress)return true;selectorInputs.push(input.scopeSelector);reads++;return read?read({setTime:v=>time=v,setVisible:v=>visible=v,frame,replace:v=>frames=v}):{status:results.shift()??'PENDING_MEMBER',revision:reads,scopeSelector:['chatgpt','a','b']};}};
 frames=[frame];const page={isClosed:()=>closed,frames:()=>frames,evaluate:async fn=>{assert.equal(fn,hostScaleMemberReadingVisible);checks++;return visible;}};
 return {page,frame,args:{page,extensionId,url,projectId,id:tail,deadline:30000,now:()=>time,pause:async ms=>{time+=ms;}},setTime:v=>time=v,setVisible:v=>visible=v,setFrames:v=>frames=v,close:()=>closed=true,state:()=>({time,reads,checks,selectorInputs})};
}
test('bounded progress reuses existing readonly scope selector and one absolute deadline',async()=>{const f=waiting(),r=await waitHostScaleMemberProgress(f.args);assert.equal(r.status,'OBSERVED_TAIL_ONLY');assert.equal(r.attempts,2);assert.equal(r.remainingMs,29900);assert.equal(r.acceptance,'NOT_ESTABLISHED');assert.deepEqual(f.state().selectorInputs,[null,['chatgpt','a','b']]);assert.equal(f.state().checks,4);});
test('native reading must remain visible after a successful late tail read',async()=>{const f=waiting({read:async c=>{c.setVisible(false);return {status:'OBSERVED_TAIL_ONLY',revision:3};}});await assert.rejects(waitHostScaleMemberProgress(f.args),/native-reading-not-visible/);});
test('late success after deadline is rejected without a second read',async()=>{const f=waiting({read:async c=>{c.setTime(30001);return {status:'OBSERVED_TAIL_ONLY',revision:3};}});await assert.rejects(waitHostScaleMemberProgress(f.args),/member-deadline/);assert.equal(f.state().reads,1);});
test('stalled unchanged membership stops at deadline without accepting a partial inventory',async()=>{const f=waiting({results:[]});f.args.deadline=250;await assert.rejects(waitHostScaleMemberProgress(f.args),/member-deadline/);assert.equal(f.state().time,250);assert.equal(f.state().reads,3);});
test('parent close, hidden reading and duplicate exact frames reject',async()=>{for(const mode of ['close','hidden','duplicate']){const f=waiting();if(mode==='close')f.close();if(mode==='hidden')f.setVisible(false);if(mode==='duplicate')f.setFrames([f.frame,f.frame]);await assert.rejects(waitHostScaleMemberProgress(f.args),/native-parent-closed|native-reading-not-visible|ambiguous-frame/);assert.equal(f.state().reads,0);}});
test('detached readonly frame result is discarded and a unique current frame is re-observed',async()=>{let oldDetached=false;const f=waiting({read:async c=>{oldDetached=true;const replacement={url:c.frame.url,isDetached:()=>false,evaluate:async fn=>fn===readHostScaleMemberProgress?{status:'OBSERVED_TAIL_ONLY',revision:4}:true};c.replace([replacement]);return {status:'OBSERVED_TAIL_ONLY',revision:3,scopeSelector:['ignored','old','scope']};}});f.frame.isDetached=()=>oldDetached;const r=await waitHostScaleMemberProgress(f.args);assert.equal(r.revision,4);assert.equal(r.attempts,1);});
test('unrelated read exceptions are not silently retried',async()=>{const f=waiting({read:async()=>{throw Error('corrupt-native-record');}});await assert.rejects(waitHostScaleMemberProgress(f.args),/corrupt-native-record/);assert.equal(f.state().reads,1);});
test('tail PROJECT cannot certify a genuinely hidden middle member or trigger timing',async()=>{
 assert.equal((await readHostScaleMemberProgress(input,{page:async()=>pageResult()})).status,'OBSERVED_TAIL_ONLY');
 let measured=0;
 const readers={version:async()=>7,page:async({offset,limit,revision})=>{assert.equal(revision,7);const selectedProjects=offset===0?[projectId]:[],start=Math.max(0,offset-1),end=Math.min(1000,offset+limit-1),selectedRefs=Array.from({length:end-start},(_,i)=>id(start+i));return {revision:7,offset,total:1001,nextOffset:Math.min(1001,offset+limit),selectedProjects,selectedRefs,facts:{refs:Object.fromEntries(selectedRefs.map(id=>[id,{id}])),projects:{[projectId]:{id:projectId}},membership:Object.fromEntries(selectedRefs.filter(x=>x!==id(500)).map(id=>[id,{id,state:'PROJECT',projectId}]))}};}};
 const result=await measureAtAdmittedScale({audit:()=>auditHostScaleIndex({size:1000,distribution:'single-project',requireProjectMembership:true},readers),measure:async()=>{measured++;return {};}});
 assert.equal(result.status,'NOT_RUN_INDEX_NOT_READY');assert.equal(result.before.status,'FAIL_PROJECT_MEMBERSHIP');assert.equal(result.before.projectMembership,999);assert.equal(result.before.unknownMembership,1);assert.equal(result.samples,null);assert.equal(measured,0);
});
test('return surfaces consume the caller deadline rather than resetting thirty seconds',async()=>{let time=29950,observations=0;const page={isClosed:()=>false,frames:()=>[],locator:()=>({count:async()=>0})};await assert.rejects(waitHostScaleSurfaces(page,{extensionId,deadline:30000,timeout:30000,now:()=>time,pause:async ms=>time+=ms,onObservation:()=>observations++}),/surfaces-deadline/);assert.equal(time,30000);assert.equal(observations,1);});
test('runner hashes helper and retains full audit; no acceptance by tail and preserves independent post-return audit',async()=>{const runner=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8'),helper=await readFile(new URL('./fixtures/host-scale-member-progress.mjs',import.meta.url),'utf8');assert(runner.includes("'fixtures/host-scale-member-progress.mjs'"));assert(runner.includes('memberReturnDeadline=performance.now()+30000'));assert(runner.includes('surfaces(page,{deadline:memberReturnDeadline})'));assert(runner.includes('measureAtAdmittedScale({audit,measure:async()=>'));assert(runner.includes("requireProjectMembership:scenario.distribution==='single-project'"));assert(helper.includes('member-progress-refuses-write-transaction'));assert(helper.includes('member-progress-refuses-schema-upgrade'));assert(!helper.includes('.count('));assert(helper.includes('frame.evaluate(auditHostScaleIndex'));assert(runner.includes('size:scenario.size,distribution:scenario.distribution,deadline:memberReturnDeadline'));assert(!helper.includes('hostObservationGate:'));});

function nativeFixture(){
 const node=parent=>({parentElement:parent,isConnected:true,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:key=>key==='data-project-id'?projectId:null});
 const body=node(null),root=node(body),members=node(root);root.contains=n=>n===members;
 const roots=[root],memberRoots=[members],context={location:{href:url},document:{querySelectorAll:selector=>selector==='main > #reading'?roots:memberRoots,querySelector:()=>null},getComputedStyle:node=>node.style};
 const visible=vm.runInNewContext('('+hostScaleMemberReadingVisible.toString()+')',context);return {body,root,members,roots,memberRoots,context,check:()=>visible({url,projectId})};
}
test('native reading observer accepts genuinely visible same-project reading',()=>assert.equal(nativeFixture().check(),true));
for(const kind of ['route','ambiguous-reading','ambiguous-members','wrong-project','open-workspace','hidden','aria-hidden','inert','display-none','visibility-hidden','visibility-collapse','disconnected','no-rects','wrong-containment'])test('native reading observer rejects '+kind,()=>{const f=nativeFixture();if(kind==='route')f.context.location.href+='?other';if(kind==='ambiguous-reading')f.roots.push(f.root);if(kind==='ambiguous-members')f.memberRoots.push(f.members);if(kind==='wrong-project')f.members.getAttribute=()=>null;if(kind==='open-workspace')f.context.document.querySelector=()=>({});if(kind==='hidden')f.body.hidden=true;if(kind==='aria-hidden')f.body.getAttribute=()=> 'true';if(kind==='inert')f.root.inert=true;if(kind==='display-none')f.root.style.display='none';if(kind==='visibility-hidden')f.members.style.visibility='hidden';if(kind==='visibility-collapse')f.members.style.visibility='collapse';if(kind==='disconnected')f.members.isConnected=false;if(kind==='no-rects')f.members.getClientRects=()=>[];if(kind==='wrong-containment')f.root.contains=()=>false;assert.equal(f.check(),false);});

test('a replaced frame cannot reuse a selector from its predecessor pending read',async()=>{
 const f=waiting({results:['PENDING_MEMBER']});let pauses=0,seen;
 f.args.pause=async()=>{if(++pauses===1){const replacement={url:f.frame.url,isDetached:()=>false,evaluate:async(fn,input)=>{if(fn!==readHostScaleMemberProgress)return true;seen=input.scopeSelector;return {status:'OBSERVED_TAIL_ONLY',revision:4,scopeSelector:['new','a','b']};}};f.setFrames([replacement]);}};
 assert.equal((await waitHostScaleMemberProgress(f.args)).revision,4);assert.equal(seen,null);
});

test('parent closure during the post-read native observation rejects before accepting tail',async()=>{const f=waiting({results:['OBSERVED_TAIL_ONLY']});let checks=0;f.page.evaluate=async()=>{if(++checks===2)f.close();return true;};await assert.rejects(waitHostScaleMemberProgress(f.args),/native-parent-closed/);assert.equal(f.state().reads,1);});

function completeWaiting(audits){
 const f=waiting({results:Array(10).fill('OBSERVED_TAIL_ONLY')});let auditReads=0;const original=f.frame.evaluate;
 f.frame.evaluate=async(fn,input)=>{if(fn!==auditHostScaleIndex)return original(fn,input);auditReads++;assert.equal(input.size,10000);assert.equal(input.distribution,'single-project');assert.equal(input.requireProjectMembership,true);assert(input.timeoutMs<=f.args.deadline-f.state().time);return audits.shift()??{status:'UNSTABLE_REVISION',revision:99};};
 Object.assign(f.args,{size:10000,distribution:'single-project'});return {...f,auditReads:()=>auditReads};
}
const complete=revision=>({status:'PASS_INDEX_AUDIT_ONLY',revision,distinctRefs:10000,projectMembership:10000,missingRefs:0,wrongProjectMembership:0,unknownMembership:0});
test('priority tail cannot finish scale preparation before complete exact membership stabilizes',async()=>{
 const f=completeWaiting([{status:'FAIL_INDEX_CARDINALITY',revision:1,distinctRefs:765,projectMembership:255,unknownMembership:510},complete(2),complete(2)]);
 const result=await waitHostScaleMemberProgress(f.args);assert.equal(f.auditReads(),3);assert.equal(result.status,'OBSERVED_COMPLETE_INDEX');assert.equal(result.revision,2);assert.equal(result.remainingMs,29800);assert.equal(result.acceptance,'NOT_ESTABLISHED');
});
test('unstable or constantly changing complete audits never authorize return',async()=>{
 const f=completeWaiting([complete(1),{status:'UNSTABLE_REVISION',revision:1},complete(2),complete(3)]);f.args.deadline=350;
 await assert.rejects(waitHostScaleMemberProgress(f.args),/member-deadline/);assert.equal(f.auditReads(),4);assert.equal(f.state().time,350);
});
test('complete scale gate leaves only caller remaining time for return surfaces',async()=>{
 const f=completeWaiting([complete(2),complete(2)]);f.args.deadline=150;const result=await waitHostScaleMemberProgress(f.args);assert.equal(result.remainingMs,50);
 const page={isClosed:()=>false,frames:()=>[],locator:()=>({count:async()=>0})};await assert.rejects(waitHostScaleSurfaces(page,{extensionId,deadline:f.args.deadline,now:()=>f.state().time,pause:async ms=>f.setTime(f.state().time+ms)}),/surfaces-deadline/);assert.equal(f.state().time,150);
});

test('full count with wrong or UNKNOWN membership never satisfies complete scale readiness',async()=>{
 const f=completeWaiting([{status:'FAIL_PROJECT_MEMBERSHIP',revision:1,distinctRefs:10000,projectMembership:9999,unknownMembership:1},{status:'FAIL_PROJECT_MEMBERSHIP',revision:2,distinctRefs:10000,projectMembership:10000,wrongProjectMembership:1}]);f.args.deadline=150;
 await assert.rejects(waitHostScaleMemberProgress(f.args),/member-deadline/);assert.equal(f.auditReads(),2);
});
test('a complete audit arriving after the absolute deadline cannot authorize return',async()=>{
 const f=completeWaiting([complete(1)]),original=f.frame.evaluate;f.frame.evaluate=async(fn,input)=>{const result=await original(fn,input);if(fn===auditHostScaleIndex)f.setTime(30000);return result;};
 await assert.rejects(waitHostScaleMemberProgress(f.args),/member-deadline/);assert.equal(f.auditReads(),1);
});

// A cheap admitted count may defer expensive audits, but never certifies membership.
test('incomplete admitted total defers inventory audit while preserving the final two full audits',async()=>{
 const f=completeWaiting([complete(9),complete(9)]),original=f.frame.evaluate;let reads=0;
 f.frame.evaluate=async(fn,input)=>{const r=await original(fn,input);if(fn===readHostScaleMemberProgress)return {...r,total:++reads<4?765:10001};return r;};
 const result=await waitHostScaleMemberProgress(f.args);assert.equal(reads,5);assert.equal(f.auditReads(),2);assert.equal(result.status,'OBSERVED_COMPLETE_INDEX');assert.equal(result.remainingMs,29600);
});
test('an incomplete admitted total cannot pass by tail before the original deadline',async()=>{
 const f=completeWaiting([complete(9),complete(9)]),original=f.frame.evaluate;f.args.deadline=250;
 f.frame.evaluate=async(fn,input)=>{const r=await original(fn,input);return fn===readHostScaleMemberProgress?{...r,total:765}:r;};
 await assert.rejects(waitHostScaleMemberProgress(f.args),/member-deadline/);assert.equal(f.auditReads(),0);assert.equal(f.state().time,250);
});
test('tail progress exposes the repository total only as a necessary audit prerequisite',async()=>{
 const result=await readHostScaleMemberProgress(input,{page:async()=>({...pageResult(),total:765})});assert.equal(result.total,765);assert.equal(result.status,'OBSERVED_TAIL_ONLY');
});
